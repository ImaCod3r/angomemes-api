import { Op, QueryTypes } from 'sequelize';
import { Like, sequelize } from '../../db/index.js';
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

/**
 * Like e unlike numa só instrução SQL (atómica por si): confirma que o meme está publicado,
 * insere ou apaga o like e só mexe na contagem se a linha mudou de facto.
 * `found` falso: o meme não existe ou não está publicado.
 */
const LIKE_SQL = `
  WITH target AS (
    SELECT id FROM memes WHERE id = :memeId AND status = 'published'
  ), changed AS (
    -- ON CONFLICT: dois pedidos ao mesmo tempo nunca dão 2 likes; só quem inseriu soma.
    INSERT INTO likes (user_id, meme_id) SELECT :userId, id FROM target
    ON CONFLICT DO NOTHING RETURNING meme_id
  ), updated AS (
    UPDATE memes SET likes_count = likes_count + 1 WHERE id IN (SELECT meme_id FROM changed) RETURNING likes_count
  )
  SELECT EXISTS (SELECT 1 FROM target) AS found,
         COALESCE((SELECT likes_count FROM updated), (SELECT likes_count FROM memes WHERE id = :memeId)) AS likes_count`;

const UNLIKE_SQL = `
  WITH target AS (
    SELECT id FROM memes WHERE id = :memeId AND status = 'published'
  ), changed AS (
    DELETE FROM likes WHERE user_id = :userId AND meme_id IN (SELECT id FROM target) RETURNING meme_id
  ), updated AS (
    UPDATE memes SET likes_count = GREATEST(likes_count - 1, 0) WHERE id IN (SELECT meme_id FROM changed) RETURNING likes_count
  )
  SELECT EXISTS (SELECT 1 FROM target) AS found,
         COALESCE((SELECT likes_count FROM updated), (SELECT likes_count FROM memes WHERE id = :memeId)) AS likes_count`;

async function toggleLike(sql: string, userId: string, memeId: string, liked: boolean): Promise<LikeState> {
  const [row] = await sequelize.query<{ found: boolean; likes_count: number | null }>(sql, {
    replacements: { userId, memeId },
    type: QueryTypes.SELECT,
  });
  // Um meme que não está publicado dá 404, como se não existisse.
  if (!row?.found) throw memeNotFound();
  return { liked, likesCount: Number(row.likes_count ?? 0) };
}

export function createLikesService(): LikesService {
  return {
    like: (userId, memeId) => toggleLike(LIKE_SQL, userId, memeId, true),

    unlike: (userId, memeId) => toggleLike(UNLIKE_SQL, userId, memeId, false),

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
