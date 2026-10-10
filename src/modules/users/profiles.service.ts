import { literal } from 'sequelize';
import { User } from '../../db/index.js';
import { AppError } from '../../errors.js';

/** Conta com o número de memes publicados (os outros estados não são públicos). */
export type ProfileUser = User & { memesCount: number };

export interface ProfilesService {
  /** Perfil público de uma conta; 404 se o username não existir. */
  getByUsername(username: string): Promise<ProfileUser>;
}

const PUBLISHED_COUNT = literal(
  `(SELECT COUNT(*) FROM memes m WHERE m.uploaded_by = "User"."id" AND m.status = 'published')`,
);

export function userNotFound(): AppError {
  return new AppError(404, 'USER_NOT_FOUND', 'Utilizador não encontrado.');
}

export function createProfilesService(): ProfilesService {
  return {
    async getByUsername(username) {
      const user = await User.findOne({
        // Nunca o email: só o que aparece na página pública.
        attributes: ['id', 'name', 'username', 'avatarUrl', 'role', 'createdAt', [PUBLISHED_COUNT, 'memesCount']],
        where: { username },
      });
      if (!user) throw userNotFound();
      return Object.assign(user, { memesCount: Number(user.get('memesCount')) });
    },
  };
}
