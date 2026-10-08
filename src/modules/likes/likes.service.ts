import { Op, QueryTypes, type Transaction } from 'sequelize';
import { Like, Meme, sequelize } from '../../db/index.js';
import { memeNotFound } from '../memes/memes.service.js';

export interface LikeState {
  liked: boolean;
  likesCount: number;
}

export interface LikesService {
  /** Dá like; repetir não conta outra vez. Só memes publicados. */
  like(userId: string, memeId: string): Promise<LikeState>;
  /** Retira o like; sem like dado, não muda nada. Só memes publicados. */
  unlike(userId: string, memeId: string): Promise<LikeState>;
  /** Quais destes memes têm like desta conta. */
  likedMemeIds(userId: string, memeIds: string[]): Promise<Set<string>>;
}

/** Um meme que não está publicado dá 404, como se não existisse. */
async function assertPublished(memeId: string, transaction: Transaction): Promise<void> {
  const meme = await Meme.findOne({ attributes: ['id'], where: { id: memeId, status: 'published' }, transaction });
  if (!meme) throw memeNotFound();
}

async function likesCountOf(memeId: string, transaction: Transaction): Promise<number> {
  const meme = await Meme.findByPk(memeId, { attributes: ['likesCount'], transaction, rejectOnEmpty: true });
  return meme.likesCount;
}

export function createLikesService(): LikesService {
  return {
    like(userId, memeId) {
      return sequelize.transaction(async (transaction) => {
        await assertPublished(memeId, transaction);
        // ON CONFLICT: dois pedidos ao mesmo tempo nunca dão 2 likes; só quem inseriu soma.
        const inserted = await sequelize.query(
          `INSERT INTO likes (user_id, meme_id) VALUES (:userId, :memeId)
           ON CONFLICT DO NOTHING RETURNING meme_id`,
          { replacements: { userId, memeId }, type: QueryTypes.SELECT, transaction },
        );
        if (inserted.length > 0) {
          await Meme.increment('likesCount', { by: 1, where: { id: memeId }, transaction });
        }
        return { liked: true, likesCount: await likesCountOf(memeId, transaction) };
      });
    },

    unlike(userId, memeId) {
      return sequelize.transaction(async (transaction) => {
        await assertPublished(memeId, transaction);
        const deleted = await sequelize.query(
          'DELETE FROM likes WHERE user_id = :userId AND meme_id = :memeId RETURNING meme_id',
          { replacements: { userId, memeId }, type: QueryTypes.SELECT, transaction },
        );
        if (deleted.length > 0) {
          await Meme.decrement('likesCount', { by: 1, where: { id: memeId }, transaction });
        }
        return { liked: false, likesCount: await likesCountOf(memeId, transaction) };
      });
    },

    async likedMemeIds(userId, memeIds) {
      if (memeIds.length === 0) return new Set();
      const rows = await Like.findAll({
        attributes: ['memeId'],
        where: { userId, memeId: { [Op.in]: memeIds } },
      });
      return new Set(rows.map((row) => row.memeId));
    },
  };
}
