import { QueryTypes } from 'sequelize';
import { sequelize, User } from '../../db/index.js';
import type { MemeType } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';

/** Conta com o número de memes publicados de cada tipo (os outros estados não são públicos). */
export type ProfileUser = User & { memesByType: Record<MemeType, number> };

export interface ProfilesService {
  /** Perfil público de uma conta; 404 se o username não existir. */
  getByUsername(username: string): Promise<ProfileUser>;
}

export function userNotFound(): AppError {
  return new AppError(404, 'USER_NOT_FOUND', 'Utilizador não encontrado.');
}

export function createProfilesService(): ProfilesService {
  return {
    async getByUsername(username) {
      const user = await User.findOne({
        // Nunca o email: só o que aparece na página pública.
        attributes: ['id', 'name', 'username', 'avatarUrl', 'role', 'createdAt'],
        where: { username },
      });
      if (!user) throw userNotFound();

      const rows = await sequelize.query<{ type: MemeType; count: string }>(
        `SELECT type, COUNT(*) AS count FROM memes
          WHERE uploaded_by = :userId AND status = 'published'
          GROUP BY type`,
        { type: QueryTypes.SELECT, replacements: { userId: user.id } },
      );
      const memesByType: Record<MemeType, number> = { video: 0, image: 0, audio: 0 };
      for (const row of rows) memesByType[row.type] = Number(row.count);
      return Object.assign(user, { memesByType });
    },
  };
}
