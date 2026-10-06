import { literal, Op, type WhereOptions } from 'sequelize';
import { User } from '../../db/index.js';
import type { Role } from '../../db/models/User.js';
import { AppError } from '../../errors.js';
import type { Page } from '../memes/memes.service.js';

export interface UsersListQuery {
  role?: Role;
  q?: string;
  page: number;
  limit: number;
}

export interface UserCounts {
  total: number;
  admins: number;
}

/** Utilizador com o número de memes que enviou (em qualquer estado). */
export type UserWithUploads = User & { uploadsCount: number };

export interface UsersService {
  list(query: UsersListQuery): Promise<Page<UserWithUploads>>;
  counts(): Promise<UserCounts>;
  setRole(actor: User, userId: string, role: Role): Promise<UserWithUploads>;
  /** ADMIN_EMAILS volta a promover em cada login: despromover estas contas não teria efeito. */
  isLockedAdmin(user: User): boolean;
}

const UPLOADS_COUNT = literal('(SELECT COUNT(*) FROM memes m WHERE m.uploaded_by = "User"."id")');

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function createUsersService(deps: { adminEmails: string[] }): UsersService {
  const isLockedAdmin = (user: User) => deps.adminEmails.includes(user.email.toLowerCase());

  async function loadWithUploads(id: string): Promise<UserWithUploads> {
    const user = await User.findByPk(id, {
      attributes: { include: [[UPLOADS_COUNT, 'uploadsCount']] },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Utilizador não encontrado.');
    return withUploads(user);
  }

  return {
    async list({ role, q, page, limit }) {
      const conditions: WhereOptions<User>[] = [];
      if (role) conditions.push({ role });
      if (q) {
        const like = `%${escapeLike(q)}%`;
        conditions.push({ [Op.or]: [{ name: { [Op.iLike]: like } }, { email: { [Op.iLike]: like } }] });
      }

      const { rows, count } = await User.findAndCountAll({
        where: { [Op.and]: conditions },
        attributes: { include: [[UPLOADS_COUNT, 'uploadsCount']] },
        order: [
          ['createdAt', 'DESC'],
          ['id', 'ASC'],
        ],
        limit,
        offset: (page - 1) * limit,
      });
      return { items: rows.map(withUploads), page, limit, total: count, hasMore: page * limit < count };
    },

    async counts() {
      const [total, admins] = await Promise.all([User.count(), User.count({ where: { role: 'admin' } })]);
      return { total, admins };
    },

    async setRole(actor, userId, role) {
      if (actor.id === userId) {
        throw new AppError(409, 'CANNOT_CHANGE_OWN_ROLE', 'Não podes mudar o teu próprio papel.');
      }
      const user = await User.findByPk(userId);
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Utilizador não encontrado.');
      if (role === 'user' && isLockedAdmin(user)) {
        throw new AppError(
          409,
          'ADMIN_BY_CONFIG',
          'Esta conta é administradora por configuração (ADMIN_EMAILS). Tira-a de lá para a despromover.',
        );
      }
      if (user.role !== role) {
        user.role = role;
        await user.save();
      }
      return loadWithUploads(userId);
    },

    isLockedAdmin,
  };
}

function withUploads(user: User): UserWithUploads {
  return Object.assign(user, { uploadsCount: Number(user.get('uploadsCount') ?? 0) });
}
