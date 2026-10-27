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
import { Meme, MemeMedia, MemeTag, sequelize, Tag, UploadTicket, User } from '../../db/index.js';
import { escapeLike } from '../../db/like.js';
import type { MemeType } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';
import {
  StorageRejectedError,
  type StoredFile,
  type StorageService,
  type Visibility,
} from '../../services/storage/StorageService.js';
import {
  acceptedFormatsMessage,
  detectFormat,
  MAX_MEDIA_PER_MEME,
  MEME_TYPE_RULES,
  tooLargeMessage,
} from './memeTypes.js';
import { FOR_YOU_SQL, spreadByUploader } from './forYou.js';
import { setVisibilityAll } from './memeFiles.js';
import { memeSlugBase, pickFreeSlug } from './slug.js';
import { FUZZY_THRESHOLD, relevanceSql, searchTerms, searchWhere } from './search.js';
import { type MemeSort, orderFor } from './sort.js';
import { MAX_TAGS_PER_MEME, normalizeTags, slugifyTag } from './tags.js';

export interface ListPublishedQuery {
  type?: MemeType;
  q?: string;
  tag?: string;
  /** Só os de uma conta (pelo username). */
  uploader?: string;
  /** Por omissão: `relevance` com pesquisa, `recent` sem. */
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
  /** Carregar os ficheiros das coleções (`meme.media`): uma consulta a mais, só o site os mostra. */
  withMedia?: boolean;
}

export interface ForYouQuery {
  /** Com sessão, o feed segue as tags dos memes a que a conta deu like. */
  userId?: string;
  /** Uma por sessão: a mesma semente dá a mesma ordem, e "mais" não repete vídeos. */
  seed: number;
  page: number;
  limit: number;
  /** O vídeo por onde o feed começou (já está no ecrã). */
  exclude?: string;
}

/** Para os que devolvem um meme: com os ficheiros da coleção ou só a capa. */
export interface MediaOption {
  withMedia?: boolean;
}

/** Tags nas sugestões da pesquisa. */
const SUGGESTED_TAGS = 4;

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

export interface ClaimUploadsInput {
  user: User;
  /** Pela ordem do carrossel: o primeiro é a capa. */
  ticketIds: string[];
  title: string;
  tagNames: string[];
}

export interface MemesService {
  listPublished(query: ListPublishedQuery): Promise<PublishedPage>;
  /** Feed vertical "Para ti": só vídeos, pela pontuação de `forYou.ts`. */
  forYou(query: ForYouQuery): Promise<PublishedPage>;
  /** Um meme publicado; qualquer outro estado dá 404, como se não existisse. */
  /** Inclui quem enviou (só os campos públicos). */
  getPublishedBySlug(slug: string, options?: MediaOption): Promise<Meme>;
  getPublishedById(id: string, options?: MediaOption): Promise<Meme>;
  /** Um meme publicado ao acaso (opcionalmente de um tipo e/ou tag); null se não houver nenhum. */
  randomPublished(filter: { type?: MemeType; tag?: string }): Promise<Meme | null>;
  /**
   * Tags com pelo menos 1 meme publicado (opcionalmente só de um tipo), com a contagem,
   * as mais usadas primeiro. Em cache durante um minuto.
   */
  listPublicTags(type?: MemeType): Promise<PublicTag[]>;
  /** Enquanto se escreve: as tags e os memes publicados que correspondem melhor a `q`. */
  suggest(query: { q: string; type?: MemeType; limit: number }): Promise<{ tags: PublicTag[]; memes: Meme[] }>;
  /** Todos os publicados (só os campos do sitemap), os mais recentes primeiro. */
  listForSitemap(): Promise<Meme[]>;
  /** Conta uma descarga; nunca falha o pedido de descarga por causa disto. */
  countDownload(meme: Meme): Promise<void>;
  upload(input: UploadMemeInput): Promise<Meme>;
  /** Autoriza o browser a enviar um ficheiro deste tipo direto para o storage. */
  createUploadTicket(user: User, type: MemeType): Promise<DirectUploadTicket>;
  /** Depois do envio direto: confirma o ficheiro com o storage e cria o meme. */
  claimUpload(input: ClaimUploadInput): Promise<Meme>;
  /** Coleção: vários envios diretos do mesmo tipo num só meme, com o carrossel pela ordem dada. */
  claimUploads(input: ClaimUploadsInput): Promise<Meme>;
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

function uploadedBy(username: string) {
  return literal(
    `"Meme"."uploaded_by" = (SELECT u.id FROM users u WHERE u.username = ${sequelize.escape(username)})`,
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

/** Vezes que o ficheiro de um ticket se confirma no storage antes de ser preciso enviá-lo outra vez. */
const MAX_TICKET_CHECKS = 3;
/** Ficheiros de uma coleção confirmados no storage ao mesmo tempo. */
const STORAGE_CHECK_CONCURRENCY = 3;

function tooManyChecks(): AppError {
  return new AppError(429, 'TOO_MANY_CHECKS', 'Demasiadas tentativas para este envio. Envia o ficheiro outra vez.');
}

/** `fn` em cada item, no máximo `limit` ao mesmo tempo; os resultados ficam pela ordem dos itens. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const SITEMAP_MAX_URLS = 50_000;

/** As tags mudam pouco e a agregação percorre todas as ligações: guarda-se um minuto. */
const TAGS_CACHE_MS = 60 * 1000;

interface SaveMemeInput {
  user: User;
  type: MemeType;
  title: string;
  tags: { slug: string; name: string }[];
  stored: StoredFile;
  /** Coleções: os ficheiros depois da capa (`stored`), pela ordem do carrossel. */
  extra?: StoredFile[];
  published: boolean;
  /** Corre dentro da transação, antes do commit; se lançar, nada fica gravado. */
  beforeCommit?: (transaction: Transaction) => Promise<void>;
}

/** Grava o meme e as tags; repete se dois envios com o mesmo título escolherem o mesmo slug. */
async function saveMeme({
  user,
  type,
  title,
  tags,
  stored,
  extra = [],
  published,
  beforeCommit,
}: SaveMemeInput): Promise<Meme> {
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
      const media = await MemeMedia.bulkCreate(
        extra.map((file, index) => ({
          memeId: meme.id,
          position: index + 1,
          publicId: file.publicId,
          resourceType: rule.resourceType,
          format: file.format,
          bytes: file.bytes,
          durationMs: file.durationMs,
          width: file.width,
          height: file.height,
        })),
        { transaction },
      );
      await beforeCommit?.(transaction);

      meme.tags = tagRows;
      meme.media = media;
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

/**
 * Junta a cada meme os ficheiros da coleção, numa só consulta.
 * Separado do findAll porque um include hasMany com limit/offset obrigaria a uma subconsulta.
 */
async function attachMedia(memes: Meme[]): Promise<void> {
  if (memes.length === 0) return;
  const rows = await MemeMedia.findAll({
    where: { memeId: memes.map((meme) => meme.id) },
    order: [['memeId', 'ASC'], ['position', 'ASC']],
  });
  const byMeme = new Map<string, MemeMedia[]>();
  for (const row of rows) {
    const list = byMeme.get(row.memeId) ?? [];
    list.push(row);
    byMeme.set(row.memeId, list);
  }
  for (const meme of memes) meme.media = byMeme.get(meme.id) ?? [];
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
    async listPublished({
      type,
      q,
      tag,
      uploader,
      sort,
      seed = 0,
      page,
      limit,
      withTotal = false,
      withMedia = false,
    }) {
      // Só `published`: pendentes, rejeitados e removidos nunca saem daqui.
      const conditions: WhereOptions<Meme>[] = [{ status: 'published' }];
      if (type) conditions.push({ type });
      const terms = q ? searchTerms(q) : null;
      // Com pesquisa e sem ordem escolhida, os que correspondem melhor primeiro.
      const effectiveSort = sort ?? (terms ? 'relevance' : 'recent');
      const byRelevance = terms !== null && effectiveSort === 'relevance';
      if (q && !terms) return { items: [], page, limit, total: withTotal ? 0 : undefined, hasMore: false };
      if (terms) conditions.push(searchWhere(terms, byRelevance ? 'some' : 'every'));
      if (tag) conditions.push(publishedWithTag(tag));
      if (uploader) conditions.push(uploadedBy(uploader));

      const order = byRelevance
        ? [[relevanceSql(terms), 'DESC'], ['likesCount', 'DESC'], ['publishedAt', 'DESC'], ['id', 'DESC']]
        : (orderFor(effectiveSort, seed) as unknown[]);

      const where = { [Op.and]: conditions };
      const [rows, total] = await Promise.all([
        // Um a mais para saber se há página seguinte sem contar tudo.
        Meme.findAll({
          where,
          include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
          order: [...order, [{ model: Tag, as: 'tags' }, 'name', 'ASC']] as Order,
          limit: limit + 1,
          offset: (page - 1) * limit,
        }),
        // Sem o JOIN às tags: muito mais barato do que o COUNT(DISTINCT) do findAndCountAll.
        withTotal ? Meme.count({ where }) : undefined,
      ]);

      const items = rows.slice(0, limit);
      if (withMedia) await attachMedia(items);
      return { items, page, limit, total, hasMore: rows.length > limit };
    },

    async forYou({ userId, seed, page, limit, exclude }) {
      // A ordem sai do SQL (ids); depois carregam-se os memes com as tags.
      const rows = await sequelize.query<{ id: string }>(FOR_YOU_SQL, {
        type: QueryTypes.SELECT,
        replacements: {
          userId: userId ?? null,
          exclude: exclude ?? null,
          seed: String(seed),
          // Um a mais para saber se há página seguinte.
          limit: limit + 1,
          offset: (page - 1) * limit,
        },
      });
      const ids = rows.slice(0, limit).map((row) => row.id);
      const memes = ids.length
        ? await Meme.findAll({
            where: { id: ids, status: 'published' },
            include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
            order: [[{ model: Tag, as: 'tags' }, 'name', 'ASC']],
          })
        : [];
      const byId = new Map(memes.map((meme) => [meme.id, meme]));
      // Pode ter deixado de estar publicado entre as duas consultas: fica de fora.
      const ordered = ids.flatMap((id) => byId.get(id) ?? []);
      await attachMedia(ordered);
      return { items: spreadByUploader(ordered), page, limit, hasMore: rows.length > limit };
    },

    async getPublishedById(id, { withMedia = false } = {}) {
      const meme = await Meme.findOne({
        where: { id, status: 'published' },
        include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
        order: [[{ model: Tag, as: 'tags' }, 'name', 'ASC']],
      });
      if (!meme) throw memeNotFound();
      if (withMedia) await attachMedia([meme]);
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

    async suggest({ q, type, limit }) {
      const terms = searchTerms(q);
      if (!terms) return { tags: [], memes: [] };
      const tagSlug = slugifyTag(q);
      const [tags, memes] = await Promise.all([
        tagSlug
          ? sequelize.query<{ slug: string; name: string; memes_count: string }>(
              `SELECT t.slug, t.name, COUNT(*) AS memes_count
                 FROM tags t
                 JOIN meme_tags mt ON mt.tag_id = t.id
                 JOIN memes m ON m.id = mt.meme_id AND m.status = 'published'${type ? ' AND m.type = :type' : ''}
                WHERE t.slug LIKE :like OR word_similarity(:slug, t.slug) >= :threshold
                GROUP BY t.id
                ORDER BY (t.slug LIKE :prefix) DESC, word_similarity(:slug, t.slug) DESC, COUNT(*) DESC
                LIMIT :limit`,
              {
                type: QueryTypes.SELECT,
                replacements: {
                  ...(type ? { type } : {}),
                  slug: tagSlug,
                  like: `%${escapeLike(tagSlug)}%`,
                  prefix: `${escapeLike(tagSlug)}%`,
                  threshold: FUZZY_THRESHOLD,
                  limit: SUGGESTED_TAGS,
                },
              },
            )
          : [],
        this.listPublished({ type, q, sort: 'relevance', page: 1, limit }),
      ]);
      return {
        tags: tags.map((row) => ({ slug: row.slug, name: row.name, memesCount: Number(row.memes_count) })),
        memes: memes.items,
      };
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

    listForSitemap() {
      return Meme.findAll({
        attributes: ['id', 'slug', 'title', 'type', 'publicId', 'resourceType', 'format', 'durationMs', 'publishedAt'],
        where: { status: 'published' },
        order: [['publishedAt', 'DESC'], ['id', 'DESC']],
        // O limite de URLs de um sitemap; acima disto, divide-se em vários.
        limit: SITEMAP_MAX_URLS,
      });
    },

    async countDownload(meme) {
      await Meme.increment('downloadsCount', { by: 1, where: { id: meme.id } }).catch((err) =>
        console.error('Falha ao contar descarga', err),
      );
    },

    async getPublishedBySlug(slug, { withMedia = false } = {}) {
      const meme = await Meme.findOne({
        where: { slug, status: 'published' },
        include: [
          { model: Tag, as: 'tags', through: { attributes: [] } },
          // Nunca o email: só o que aparece na página pública.
          { model: User, as: 'uploader', attributes: ['name', 'username', 'avatarUrl', 'role'] },
        ],
        order: [[{ model: Tag, as: 'tags' }, 'name', 'ASC']],
      });
      if (!meme) throw memeNotFound();
      if (withMedia) await attachMedia([meme]);
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

    claimUpload({ ticketId, ...rest }) {
      return this.claimUploads({ ...rest, ticketIds: [ticketId] });
    },

    async claimUploads({ user, ticketIds, title, tagNames }) {
      const tags = validatedTags(tagNames);
      if (ticketIds.length === 0 || new Set(ticketIds).size !== ticketIds.length) {
        throw new AppError(400, 'INVALID_TICKETS', 'Lista de envios inválida.');
      }
      if (ticketIds.length > MAX_MEDIA_PER_MEME) {
        throw new AppError(400, 'TOO_MANY_FILES', `No máximo ${MAX_MEDIA_PER_MEME} ficheiros por coleção.`);
      }
      // Só os tickets da própria pessoa: um de outra conta "não existe".
      const found = await UploadTicket.findAll({
        where: { id: ticketIds, userId: user.id, claimedAt: null, expiresAt: { [Op.gt]: new Date() } },
      });
      if (found.length !== ticketIds.length) throw uploadNotFound();
      const byId = new Map(found.map((ticket) => [ticket.id, ticket]));
      const tickets = ticketIds.map((id) => byId.get(id)!);

      const type = tickets[0]!.type;
      if (tickets.some((ticket) => ticket.type !== type)) {
        throw new AppError(400, 'MIXED_TYPES', 'Os ficheiros de uma coleção têm de ser todos do mesmo tipo.');
      }
      const rule = MEME_TYPE_RULES[type];

      // Confirmar no storage gasta a Admin API do Cloudinary, com quota por hora para a conta
      // toda: cada ticket só se confirma MAX_TICKET_CHECKS vezes. A contagem sobe numa só
      // instrução e só nos que ainda têm tentativas, para pedidos ao mesmo tempo não passarem.
      if (tickets.some((ticket) => ticket.checks >= MAX_TICKET_CHECKS)) throw tooManyChecks();
      const [counted] = await UploadTicket.update(
        { checks: literal('checks + 1') as unknown as number },
        { where: { id: ticketIds, checks: { [Op.lt]: MAX_TICKET_CHECKS } } },
      );
      if (counted !== ticketIds.length) throw tooManyChecks();

      // Os dados vêm do próprio storage, nunca do browser. Poucos de cada vez, para uma
      // coleção não abrir 10 ligações ao mesmo tempo.
      const stored = await mapLimit(tickets, STORAGE_CHECK_CONCURRENCY, (ticket) =>
        storage.getUploaded({
          publicId: ticket.publicId,
          resourceType: ticket.resourceType,
          visibility: ticket.visibility,
        }),
      );
      if (stored.some((file) => !file)) {
        throw new AppError(409, 'UPLOAD_NOT_RECEIVED', 'O ficheiro ainda não chegou. Espera que o envio termine.');
      }
      const files = stored as StoredFile[];
      const refOf = (index: number) => ({
        publicId: files[index]!.publicId,
        resourceType: tickets[index]!.resourceType,
        format: files[index]!.format,
      });

      // O storage não sabe limitar o tamanho por tipo: confirma-se aqui e apaga-se o que passar.
      // Os outros ficheiros continuam por reclamar e a limpeza apaga-os se não voltarem.
      let refusal: AppError | null = null;
      for (const [index, file] of files.entries()) {
        const badFormat = !rule.cloudinaryFormats.includes(file.format);
        if (!badFormat && (file.bytes ?? 0) <= rule.maxBytes) continue;
        const ticket = tickets[index]!;
        await storage
          .destroy({ ...refOf(index), visibility: ticket.visibility })
          .catch((err) => console.error('Falha ao apagar envio recusado', err));
        await ticket.destroy();
        refusal ??= badFormat
          ? new AppError(415, 'UNSUPPORTED_FORMAT', acceptedFormatsMessage(type))
          : new AppError(413, 'FILE_TOO_LARGE', tooLargeMessage(type));
      }
      if (refusal) throw refusal;

      // Quem deixou de ser admin desde que pediu os tickets já não publica direto.
      const published = user.role === 'admin' && tickets.every((ticket) => ticket.visibility === 'public');
      if (!published) {
        const publicOnes = [...tickets.keys()].filter((index) => tickets[index]!.visibility === 'public');
        if (publicOnes.length > 0) {
          // Todos ou nenhum: se um falhar, os outros voltam a públicos e o ticket fica igual.
          await setVisibilityAll(storage, publicOnes.map(refOf), 'public', 'private');
          await UploadTicket.update(
            { visibility: 'private' },
            { where: { id: publicOnes.map((index) => tickets[index]!.id) } },
          );
        }
      }

      // Se a gravação falhar, os tickets continuam por reclamar e a limpeza apaga os ficheiros.
      return saveMeme({
        user,
        type,
        title,
        tags,
        stored: files[0]!,
        extra: files.slice(1),
        published,
        // Na mesma transação: dois pedidos ao mesmo tempo com os mesmos tickets criam um só meme.
        async beforeCommit(transaction) {
          const [claimed] = await UploadTicket.update(
            { claimedAt: new Date() },
            { where: { id: ticketIds, claimedAt: null }, transaction },
          );
          if (claimed !== ticketIds.length) throw uploadNotFound();
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
