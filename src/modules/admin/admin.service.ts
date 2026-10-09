import { fn, col, Op, type Transaction, type WhereOptions } from 'sequelize';
import { Meme, MemeTag, sequelize, Tag, User } from '../../db/index.js';
import { escapeLike } from '../../db/like.js';
import { MEME_STATUSES, type MemeStatus, type MemeType } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';
import type { StorageService } from '../../services/storage/StorageService.js';
import { assertTransition } from '../memes/memeStatus.js';
import { type Page, upsertTags, validatedTags } from '../memes/memes.service.js';

export interface AdminListQuery {
  status: MemeStatus;
  type?: MemeType;
  q?: string;
  page: number;
  limit: number;
}

export interface MemeEdits {
  title?: string;
  tags?: string[];
}

export type StatusCounts = Record<MemeStatus, number>;

export interface AdminService {
  list(query: AdminListQuery): Promise<Page<Meme>>;
  counts(): Promise<StatusCounts>;
  get(id: string): Promise<Meme>;
  /** Editar título e tags; o slug fica igual para não partir links. */
  edit(id: string, edits: MemeEdits): Promise<Meme>;
  approve(id: string, reviewer: User, edits: MemeEdits): Promise<Meme>;
  reject(id: string, reviewer: User, reason: string): Promise<Meme>;
  remove(id: string, reviewer: User): Promise<Meme>;
}

const INCLUDE = [
  { model: Tag, as: 'tags', through: { attributes: [] } },
  { model: User, as: 'uploader', attributes: ['id', 'name', 'email'] },
];

function notFound(): AppError {
  return new AppError(404, 'MEME_NOT_FOUND', 'Meme não encontrado.');
}

export function createAdminService(deps: { storage: StorageService }): AdminService {
  const { storage } = deps;

  async function load(id: string, transaction?: Transaction): Promise<Meme> {
    if (transaction) {
      // Bloqueia a linha: dois administradores a aprovar e a rejeitar ao mesmo tempo
      // não podem ver os dois o meme como pendente. (Sem include: o FOR UPDATE não
      // funciona com o lado opcional de um LEFT JOIN.)
      const locked = await Meme.findByPk(id, { attributes: ['id'], lock: true, transaction });
      if (!locked) throw notFound();
    }
    const meme = await Meme.findByPk(id, {
      include: INCLUDE,
      order: [[{ model: Tag, as: 'tags' }, 'name', 'ASC']],
      transaction,
    });
    if (!meme) throw notFound();
    return meme;
  }

  async function applyEdits(meme: Meme, edits: MemeEdits, transaction: Transaction) {
    if (edits.title !== undefined) meme.title = edits.title;
    if (edits.tags !== undefined) {
      const tagRows = await upsertTags(validatedTags(edits.tags), transaction);
      await MemeTag.destroy({ where: { memeId: meme.id }, transaction });
      await MemeTag.bulkCreate(
        tagRows.map((tag) => ({ memeId: meme.id, tagId: tag.id })),
        { transaction },
      );
    }
  }

  function refOf(meme: Meme) {
    return { publicId: meme.publicId, resourceType: meme.resourceType, format: meme.format };
  }

  return {
    async list({ status, type, q, page, limit }) {
      const where: WhereOptions<Meme> = { status };
      if (type) Object.assign(where, { type });
      if (q) Object.assign(where, { title: { [Op.iLike]: `%${escapeLike(q)}%` } });

      const { rows, count } = await Meme.findAndCountAll({
        where,
        include: INCLUDE,
        // Pendentes: os mais antigos primeiro, como uma fila. Os outros: os mais recentes.
        order: [
          ['createdAt', status === 'pending' ? 'ASC' : 'DESC'],
          ['id', 'ASC'],
          [{ model: Tag, as: 'tags' }, 'name', 'ASC'],
        ],
        limit,
        offset: (page - 1) * limit,
        distinct: true,
      });
      return { items: rows, page, limit, total: count, hasMore: page * limit < count };
    },

    async counts() {
      const rows = (await Meme.findAll({
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        group: ['status'],
        raw: true,
      })) as unknown as { status: MemeStatus; count: string }[];
      const counts = Object.fromEntries(MEME_STATUSES.map((s) => [s, 0])) as StatusCounts;
      for (const row of rows) counts[row.status] = Number(row.count);
      return counts;
    },

    get: (id) => load(id),

    async edit(id, edits) {
      await sequelize.transaction(async (transaction) => {
        const meme = await load(id, transaction);
        if (meme.status !== 'pending' && meme.status !== 'published') {
          throw new AppError(409, 'NOT_EDITABLE', 'Só se editam memes pendentes ou publicados.');
        }
        await applyEdits(meme, edits, transaction);
        await meme.save({ transaction });
      });
      return load(id);
    },

    async approve(id, reviewer, edits) {
      await sequelize.transaction(async (transaction) => {
        const meme = await load(id, transaction);
        assertTransition(meme.status, 'published');
        await applyEdits(meme, edits, transaction);
        meme.status = 'published';
        meme.reviewedBy = reviewer.id;
        meme.reviewedAt = new Date();
        meme.publishedAt = new Date();
        await meme.save({ transaction });
        // Por último, para um erro na base não deixar o ficheiro público com o meme pendente.
        // Se o storage falhar, a transação desfaz-se e o meme continua pendente.
        await storage.setVisibility(refOf(meme), 'private', 'public');
      });
      return load(id);
    },

    async reject(id, reviewer, reason) {
      const meme = await sequelize.transaction(async (transaction) => {
        const meme = await load(id, transaction);
        assertTransition(meme.status, 'rejected');
        meme.status = 'rejected';
        meme.rejectionReason = reason;
        meme.reviewedBy = reviewer.id;
        meme.reviewedAt = new Date();
        await meme.save({ transaction });
        return meme;
      });
      // O registo fica; o ficheiro apaga-se para não gastar quota. Uma falha aqui só deixa lixo.
      await storage
        .destroy({ ...refOf(meme), visibility: 'private' })
        .catch((err) => console.error('Falha ao apagar ficheiro rejeitado', err));
      return load(id);
    },

    async remove(id, reviewer) {
      await sequelize.transaction(async (transaction) => {
        const meme = await load(id, transaction);
        assertTransition(meme.status, 'removed');
        meme.status = 'removed';
        meme.reviewedBy = reviewer.id;
        meme.reviewedAt = new Date();
        await meme.save({ transaction });
        // Deixa de ser público de imediato (com limpeza da cache da CDN).
        await storage.setVisibility(refOf(meme), 'public', 'private');
      });
      return load(id);
    },
  };
}
