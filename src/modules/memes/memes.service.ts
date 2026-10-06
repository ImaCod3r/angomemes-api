import { literal, Op, type Order, type Transaction, UniqueConstraintError, type WhereOptions } from 'sequelize';
import { Meme, MemeTag, sequelize, Tag, User } from '../../db/index.js';
import type { MemeType } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';
import { StorageRejectedError, type StorageService } from '../../services/storage/StorageService.js';
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
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface UploadMemeInput {
  user: User;
  type: MemeType;
  title: string;
  tagNames: string[];
  file: Buffer;
}

export interface MemesService {
  listPublished(query: ListPublishedQuery): Promise<Page<Meme>>;
  /** Um meme publicado; qualquer outro estado dá 404, como se não existisse. */
  /** Inclui quem enviou (só os campos públicos). */
  getPublishedBySlug(slug: string): Promise<Meme>;
  /** Conta uma descarga; nunca falha o pedido de descarga por causa disto. */
  countDownload(meme: Meme): Promise<void>;
  upload(input: UploadMemeInput): Promise<Meme>;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
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

export function memeNotFound(): AppError {
  return new AppError(404, 'MEME_NOT_FOUND', 'Meme não encontrado.');
}

export function createMemesService(deps: { storage: StorageService }): MemesService {
  const { storage } = deps;

  return {
    async listPublished({ type, q, tag, sort = 'recent', seed = 0, page, limit }) {
      // Só `published`: pendentes, rejeitados e removidos nunca saem daqui.
      const conditions: WhereOptions<Meme>[] = [{ status: 'published' }];
      if (type) conditions.push({ type });
      if (q) conditions.push({ title: { [Op.iLike]: `%${escapeLike(q)}%` } });
      if (tag) {
        // Subconsulta em vez de filtrar o include, para cada meme continuar a trazer todas as tags.
        conditions.push(
          literal(
            `"Meme"."id" IN (SELECT mt.meme_id FROM meme_tags mt JOIN tags t ON t.id = mt.tag_id WHERE t.slug = ${sequelize.escape(slugifyTag(tag))})`,
          ),
        );
      }

      const { rows, count } = await Meme.findAndCountAll({
        where: { [Op.and]: conditions },
        include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
        order: [...(orderFor(sort, seed) as unknown[]), [{ model: Tag, as: 'tags' }, 'name', 'ASC']] as Order,
        limit,
        offset: (page - 1) * limit,
        distinct: true,
      });

      return { items: rows, page, limit, total: count, hasMore: page * limit < count };
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
          throw new AppError(422, 'FILE_REJECTED', `O ficheiro foi recusado: ${err.message}`);
        }
        throw err;
      }

      const save = () =>
        sequelize.transaction(async (transaction) => {
          const tagRows = await upsertTags(tags, transaction);

          const meme = await Meme.create(
            {
              type,
              title,
              slug: await freeSlugFor(title, transaction),
              status: isAdmin ? 'published' : 'pending',
              publicId: stored.publicId,
              resourceType: rule.resourceType,
              format: stored.format,
              bytes: stored.bytes,
              durationMs: stored.durationMs,
              width: stored.width,
              height: stored.height,
              uploadedBy: user.id,
              publishedAt: isAdmin ? new Date() : null,
            },
            { transaction },
          );
          await MemeTag.bulkCreate(
            tagRows.map((tag) => ({ memeId: meme.id, tagId: tag.id })),
            { transaction },
          );

          meme.tags = tagRows;
          return meme;
        });

      try {
        for (let attempt = 1; ; attempt++) {
          try {
            return await save();
          } catch (err) {
            if (!(err instanceof UniqueConstraintError) || attempt >= SLUG_ATTEMPTS) throw err;
          }
        }
      } catch (err) {
        // Sem registo na base, o ficheiro ficaria órfão no Cloudinary a gastar quota.
        await storage
          .destroy({ publicId: stored.publicId, resourceType: rule.resourceType, format: stored.format, visibility })
          .catch((destroyErr) => console.error('Falha ao apagar ficheiro órfão', destroyErr));
        throw err;
      }
    },
  };
}
