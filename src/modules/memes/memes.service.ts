import { randomUUID } from 'node:crypto';
import {
  literal,
  Op,
  type Order,
  QueryTypes,
  type Transaction,
  UniqueConstraintError,
  type WhereOptions,
} from 'sequelize';
import { Meme, MemeTag, sequelize, Tag, UploadTicket, User } from '../../db/index.js';
import { escapeLike } from '../../db/like.js';
import type { MemeType } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';
import {
  StorageRejectedError,
  type StoredFile,
  type StorageService,
  type Visibility,
} from '../../services/storage/StorageService.js';
import { acceptedFormatsMessage, detectFormat, MEME_TYPE_RULES, tooLargeMessage } from './memeTypes.js';
import { memeSlugBase, pickFreeSlug } from './slug.js';
import { type MemeSort, orderFor } from './sort.js';
import { MAX_TAGS_PER_MEME, normalizeTags, slugifyTag } from './tags.js';

export interface ListPublishedQuery {
  type?: MemeType;
  q?: string;
  tag?: string;
  sort?: MemeSort;
  /** Só para `sort: 'random'`. */
  seed?: number;
  page: number;
  limit: number;
  /**
   * Contar o total custa uma consulta a mais em cada página; só a API pública o promete.
   * Sem isto, `hasMore` sai de pedir um meme a mais.
   */
  withTotal?: boolean;
}

/** Páginas muito fundas obrigam a base a saltar milhares de linhas (OFFSET): param aqui. */
export const MAX_PAGE = 1000;

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export type PublishedPage = Omit<Page<Meme>, 'total'> & { total?: number };

export interface PublicTag {
  slug: string;
  name: string;
  memesCount: number;
}

export interface UploadMemeInput {
  user: User;
  type: MemeType;
  title: string;
  tagNames: string[];
  file: Buffer;
}

export interface DirectUploadTicket {
  ticketId: string;
  /** Para onde o browser envia o ficheiro (POST multipart com `fields` e o campo `file`). */
  uploadUrl: string;
  fields: Record<string, string>;
  maxBytes: number;
  expiresAt: Date;
}

export interface ClaimUploadInput {
  user: User;
  ticketId: string;
  title: string;
  tagNames: string[];
}

export interface MemesService {
  listPublished(query: ListPublishedQuery): Promise<PublishedPage>;
  /** Um meme publicado; qualquer outro estado dá 404, como se não existisse. */
  /** Inclui quem enviou (só os campos públicos). */
  getPublishedBySlug(slug: string): Promise<Meme>;
  getPublishedById(id: string): Promise<Meme>;
  /** Um meme publicado ao acaso (opcionalmente de um tipo e/ou tag); null se não houver nenhum. */
  randomPublished(filter: { type?: MemeType; tag?: string }): Promise<Meme | null>;
  /**
   * Tags com pelo menos 1 meme publicado (opcionalmente só de um tipo), com a contagem,
   * as mais usadas primeiro. Em cache durante um minuto.
   */
  listPublicTags(type?: MemeType): Promise<PublicTag[]>;
  /** Conta uma descarga; nunca falha o pedido de descarga por causa disto. */
  countDownload(meme: Meme): Promise<void>;
  upload(input: UploadMemeInput): Promise<Meme>;
  /** Autoriza o browser a enviar um ficheiro deste tipo direto para o storage. */
  createUploadTicket(user: User, type: MemeType): Promise<DirectUploadTicket>;
  /** Depois do envio direto: confirma o ficheiro com o storage e cria o meme. */
  claimUpload(input: ClaimUploadInput): Promise<Meme>;
  /** Apaga os ficheiros de envios que expiraram sem ser reclamados. Devolve quantos. */
  sweepExpiredUploads(): Promise<number>;
}

/** Normaliza as tags e garante entre 1 e o máximo por meme. */
export function validatedTags(tagNames: string[]): { slug: string; name: string }[] {
  const tags = normalizeTags(tagNames);
  if (tags.length === 0) {
    throw new AppError(400, 'TAGS_REQUIRED', 'Indica pelo menos 1 tag.');
  }
  if (tags.length > MAX_TAGS_PER_MEME) {
    throw new AppError(400, 'TOO_MANY_TAGS', `No máximo ${MAX_TAGS_PER_MEME} tags por meme.`);
  }
  return tags;
}

/** As tags novas criam-se na hora; as que já existem ficam como estão. */
export async function upsertTags(
  tags: { slug: string; name: string }[],
  transaction: Transaction,
): Promise<Tag[]> {
  await Tag.bulkCreate(tags, { ignoreDuplicates: true, transaction });
  return Tag.findAll({ where: { slug: tags.map((t) => t.slug) }, order: [['name', 'ASC']], transaction });
}

/** Tentativas quando dois envios com o mesmo título escolhem o mesmo slug ao mesmo tempo. */
const SLUG_ATTEMPTS = 3;

/** Primeiro slug livre para o título; conta com todos os estados, porque o slug é único na tabela. */
async function freeSlugFor(title: string, transaction: Transaction): Promise<string> {
  const base = memeSlugBase(title);
  // A base só tem [a-z0-9-], por isso não há % nem _ a escapar no LIKE.
  const rows = await Meme.findAll({
    attributes: ['slug'],
    where: { [Op.or]: [{ slug: base }, { slug: { [Op.like]: `${base}-%` } }] },
    transaction,
  });
  return pickFreeSlug(base, rows.map((row) => row.slug));
}

/** Subconsulta em vez de filtrar o include, para cada meme continuar a trazer todas as tags. */
function publishedWithTag(tag: string) {
  return literal(
    `"Meme"."id" IN (SELECT mt.meme_id FROM meme_tags mt JOIN tags t ON t.id = mt.tag_id WHERE t.slug = ${sequelize.escape(slugifyTag(tag))})`,
  );
}

/**
 * A assinatura do Cloudinary vale 1 hora; o ticket pode ser reclamado durante 2, para um
 * envio lento que começou perto do fim ainda chegar a tempo.
 */
const UPLOAD_TICKET_TTL_MS = 2 * 60 * 60 * 1000;
/** Tickets já reclamados guardam-se uma semana (para diagnóstico) e depois apagam-se. */
const CLAIMED_TICKET_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function uploadNotFound(): AppError {
  return new AppError(404, 'UPLOAD_NOT_FOUND', 'Envio não encontrado ou expirado. Envia o ficheiro outra vez.');
}

/** As tags mudam pouco e a agregação percorre todas as ligações: guarda-se um minuto. */
const TAGS_CACHE_MS = 60 * 1000;

interface SaveMemeInput {
  user: User;
  type: MemeType;
  title: string;
  tags: { slug: string; name: string }[];
  stored: StoredFile;
  published: boolean;
  /** Corre dentro da transação, antes do commit; se lançar, nada fica gravado. */
  beforeCommit?: (transaction: Transaction) => Promise<void>;
}

/** Grava o meme e as tags; repete se dois envios com o mesmo título escolherem o mesmo slug. */
async function saveMeme({ user, type, title, tags, stored, published, beforeCommit }: SaveMemeInput): Promise<Meme> {
  const rule = MEME_TYPE_RULES[type];
  const save = () =>
    sequelize.transaction(async (transaction) => {
      const tagRows = await upsertTags(tags, transaction);

      const meme = await Meme.create(
        {
          type,
          title,
          slug: await freeSlugFor(title, transaction),
          status: published ? 'published' : 'pending',
          publicId: stored.publicId,
          resourceType: rule.resourceType,
          format: stored.format,
          bytes: stored.bytes,
          durationMs: stored.durationMs,
          width: stored.width,
          height: stored.height,
          uploadedBy: user.id,
          publishedAt: published ? new Date() : null,
        },
        { transaction },
      );
      await MemeTag.bulkCreate(
        tagRows.map((tag) => ({ memeId: meme.id, tagId: tag.id })),
        { transaction },
      );
      await beforeCommit?.(transaction);

      meme.tags = tagRows;
      return meme;
    });

  for (let attempt = 1; ; attempt++) {
    try {
      return await save();
    } catch (err) {
      if (!(err instanceof UniqueConstraintError) || attempt >= SLUG_ATTEMPTS) throw err;
    }
  }
}

export function memeNotFound(): AppError {
  return new AppError(404, 'MEME_NOT_FOUND', 'Meme não encontrado.');
}

export function createMemesService(deps: { storage: StorageService }): MemesService {
  const { storage } = deps;
  const tagsCache = new Map<string, { at: number; tags: Promise<PublicTag[]> }>();

  async function queryPublicTags(type: MemeType | undefined): Promise<PublicTag[]> {
    const rows = await sequelize.query<{ slug: string; name: string; memes_count: string }>(
      `SELECT t.slug, t.name, COUNT(*) AS memes_count
         FROM tags t
         JOIN meme_tags mt ON mt.tag_id = t.id
         JOIN memes m ON m.id = mt.meme_id AND m.status = 'published'${type ? ' AND m.type = :type' : ''}
        GROUP BY t.id
        ORDER BY COUNT(*) DESC, t.name ASC`,
      { type: QueryTypes.SELECT, replacements: type ? { type } : undefined },
    );
    return rows.map((row) => ({ slug: row.slug, name: row.name, memesCount: Number(row.memes_count) }));
  }

  return {
    async listPublished({ type, q, tag, sort = 'recent', seed = 0, page, limit, withTotal = false }) {
      // Só `published`: pendentes, rejeitados e removidos nunca saem daqui.
      const conditions: WhereOptions<Meme>[] = [{ status: 'published' }];
      if (type) conditions.push({ type });
      if (q) conditions.push({ title: { [Op.iLike]: `%${escapeLike(q)}%` } });
      if (tag) conditions.push(publishedWithTag(tag));

      const where = { [Op.and]: conditions };
      const [rows, total] = await Promise.all([
        // Um a mais para saber se há página seguinte sem contar tudo.
        Meme.findAll({
          where,
          include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
          order: [...(orderFor(sort, seed) as unknown[]), [{ model: Tag, as: 'tags' }, 'name', 'ASC']] as Order,
          limit: limit + 1,
          offset: (page - 1) * limit,
        }),
        // Sem o JOIN às tags: muito mais barato do que o COUNT(DISTINCT) do findAndCountAll.
        withTotal ? Meme.count({ where }) : undefined,
      ]);

      return { items: rows.slice(0, limit), page, limit, total, hasMore: rows.length > limit };
    },

    async getPublishedById(id) {
      const meme = await Meme.findOne({
        where: { id, status: 'published' },
        include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
        order: [[{ model: Tag, as: 'tags' }, 'name', 'ASC']],
      });
      if (!meme) throw memeNotFound();
      return meme;
    },

    async randomPublished({ type, tag }) {
      const conditions: WhereOptions<Meme>[] = [{ status: 'published' }];
      if (type) conditions.push({ type });
      if (tag) conditions.push(publishedWithTag(tag));
      // Cada meme tem um `random_key` fixo, sorteado ao criar: o primeiro a partir de um
      // ponto ao acaso sai pelo índice, sem ordenar a tabela toda como o ORDER BY random().
      // Se o ponto calhar depois do último, dá a volta e fica o primeiro.
      const pick = (from?: number) =>
        Meme.findOne({
          attributes: ['id'],
          where: { [Op.and]: from === undefined ? conditions : [...conditions, { randomKey: { [Op.gte]: from } }] },
          order: [['randomKey', 'ASC']],
        });
      const picked = (await pick(Math.random())) ?? (await pick());
      return picked ? this.getPublishedById(picked.id) : null;
    },

    listPublicTags(type) {
      const key = type ?? '';
      const cached = tagsCache.get(key);
      if (cached && Date.now() - cached.at < TAGS_CACHE_MS) return cached.tags;
      // Guarda a promessa: pedidos ao mesmo tempo partilham a mesma consulta.
      const tags = queryPublicTags(type);
      tagsCache.set(key, { at: Date.now(), tags });
      tags.catch(() => tagsCache.delete(key));
      return tags;
    },

    async countDownload(meme) {
      await Meme.increment('downloadsCount', { by: 1, where: { id: meme.id } }).catch((err) =>
        console.error('Falha ao contar descarga', err),
      );
    },

    async getPublishedBySlug(slug) {
      const meme = await Meme.findOne({
        where: { slug, status: 'published' },
        include: [
          { model: Tag, as: 'tags', through: { attributes: [] } },
          // Nunca o email: só o que aparece na página pública.
          { model: User, as: 'uploader', attributes: ['name', 'avatarUrl', 'role'] },
        ],
        order: [[{ model: Tag, as: 'tags' }, 'name', 'ASC']],
      });
      if (!meme) throw memeNotFound();
      return meme;
    },

    async upload({ user, type, title, tagNames, file }) {
      const rule = MEME_TYPE_RULES[type];

      // Tudo o que pode falhar é validado antes do upload, para não gastar quota do Cloudinary.
      const tags = validatedTags(tagNames);
      if (file.length > rule.maxBytes) {
        throw new AppError(413, 'FILE_TOO_LARGE', tooLargeMessage(type));
      }
      if (!(await detectFormat(type, file))) {
        throw new AppError(415, 'UNSUPPORTED_FORMAT', acceptedFormatsMessage(type));
      }

      // Admin publica direto; utilizador fica pendente e com o ficheiro privado.
      const isAdmin = user.role === 'admin';
      const visibility = isAdmin ? 'public' : 'private';

      let stored;
      try {
        stored = await storage.upload({
          buffer: file,
          resourceType: rule.resourceType,
          allowedFormats: rule.cloudinaryFormats,
          visibility,
        });
      } catch (err) {
        if (err instanceof StorageRejectedError) {
          // O detalhe do fornecedor fica no log; a pessoa recebe uma mensagem nossa.
          console.error('Ficheiro recusado pelo storage', err.message);
          throw new AppError(422, 'FILE_REJECTED', 'O ficheiro foi recusado. Confirma que não está corrompido.');
        }
        throw err;
      }

      try {
        return await saveMeme({ user, type, title, tags, stored, published: isAdmin });
      } catch (err) {
        // Sem registo na base, o ficheiro ficaria órfão no Cloudinary a gastar quota.
        await storage
          .destroy({ publicId: stored.publicId, resourceType: rule.resourceType, format: stored.format, visibility })
          .catch((destroyErr) => console.error('Falha ao apagar ficheiro órfão', destroyErr));
        throw err;
      }
    },

    async createUploadTicket(user, type) {
      const rule = MEME_TYPE_RULES[type];
      const visibility: Visibility = user.role === 'admin' ? 'public' : 'private';
      const signed = storage.signUpload({
        name: randomUUID(),
        resourceType: rule.resourceType,
        allowedFormats: rule.cloudinaryFormats,
        visibility,
      });
      const ticket = await UploadTicket.create({
        userId: user.id,
        type,
        resourceType: rule.resourceType,
        publicId: signed.publicId,
        visibility,
        expiresAt: new Date(Date.now() + UPLOAD_TICKET_TTL_MS),
      });
      return {
        ticketId: ticket.id,
        uploadUrl: signed.url,
        fields: signed.fields,
        maxBytes: rule.maxBytes,
        expiresAt: ticket.expiresAt,
      };
    },

    async claimUpload({ user, ticketId, title, tagNames }) {
      const tags = validatedTags(tagNames);
      // Só os tickets da própria pessoa: um de outra conta "não existe".
      const ticket = await UploadTicket.findOne({
        where: { id: ticketId, userId: user.id, claimedAt: null, expiresAt: { [Op.gt]: new Date() } },
      });
      if (!ticket) throw uploadNotFound();

      const rule = MEME_TYPE_RULES[ticket.type];
      // Os dados vêm do próprio storage, nunca do browser.
      const stored = await storage.getUploaded({
        publicId: ticket.publicId,
        resourceType: ticket.resourceType,
        visibility: ticket.visibility,
      });
      if (!stored) {
        throw new AppError(409, 'UPLOAD_NOT_RECEIVED', 'O ficheiro ainda não chegou. Espera que o envio termine.');
      }
      const ref = { publicId: stored.publicId, resourceType: ticket.resourceType, format: stored.format };

      // O storage não sabe limitar o tamanho por tipo: confirma-se aqui e apaga-se o que passar.
      const badFormat = !rule.cloudinaryFormats.includes(stored.format);
      if (badFormat || (stored.bytes ?? 0) > rule.maxBytes) {
        await storage
          .destroy({ ...ref, visibility: ticket.visibility })
          .catch((err) => console.error('Falha ao apagar envio recusado', err));
        await ticket.destroy();
        throw badFormat
          ? new AppError(415, 'UNSUPPORTED_FORMAT', acceptedFormatsMessage(ticket.type))
          : new AppError(413, 'FILE_TOO_LARGE', tooLargeMessage(ticket.type));
      }

      // Quem deixou de ser admin desde que pediu o ticket já não publica direto.
      const published = ticket.visibility === 'public' && user.role === 'admin';
      if (ticket.visibility === 'public' && !published) {
        await storage.setVisibility(ref, 'public', 'private');
        await ticket.update({ visibility: 'private' });
      }

      // Se a gravação falhar, o ticket continua por reclamar e a limpeza apaga o ficheiro.
      return saveMeme({
        user,
        type: ticket.type,
        title,
        tags,
        stored,
        published,
        // Na mesma transação: dois pedidos ao mesmo tempo com o mesmo ticket criam um só meme.
        async beforeCommit(transaction) {
          const [claimed] = await UploadTicket.update(
            { claimedAt: new Date() },
            { where: { id: ticket.id, claimedAt: null }, transaction },
          );
          if (claimed === 0) throw uploadNotFound();
        },
      });
    },

    async sweepExpiredUploads() {
      const expired = await UploadTicket.findAll({
        where: { claimedAt: null, expiresAt: { [Op.lt]: new Date() } },
        limit: 100,
      });
      for (const ticket of expired) {
        try {
          await storage.destroy({
            publicId: ticket.publicId,
            resourceType: ticket.resourceType,
            format: '',
            visibility: ticket.visibility,
          });
          await ticket.destroy();
        } catch (err) {
          console.error('Falha ao limpar envio expirado', ticket.id, err);
        }
      }
      await UploadTicket.destroy({
        where: { claimedAt: { [Op.lt]: new Date(Date.now() - CLAIMED_TICKET_RETENTION_MS) } },
      });
      return expired.length;
    },
  };
}
