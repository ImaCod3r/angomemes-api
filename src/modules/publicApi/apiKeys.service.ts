import { Op } from 'sequelize';
import { ApiKey, sequelize, type User } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { generateApiKey, hashApiKey, isWellFormedApiKey, MAX_ACTIVE_KEYS_PER_USER } from './apiKeys.js';

/** Não se escreve na base em cada pedido: o "último uso" atualiza-se no máximo uma vez por minuto. */
const LAST_USED_RESOLUTION_MS = 60 * 1000;

export interface ApiKeysService {
  /** Ativas e revogadas, as mais recentes primeiro. */
  listForUser(user: User): Promise<ApiKey[]>;
  /** Devolve a chave completa uma única vez; a base só guarda o hash. */
  create(user: User, name: string): Promise<{ apiKey: ApiKey; key: string }>;
  revoke(user: User, id: string): Promise<ApiKey>;
  /** A chave ativa correspondente, ou null (inexistente, revogada ou mal formada). */
  verify(rawKey: string): Promise<ApiKey | null>;
}

export function createApiKeysService(): ApiKeysService {
  return {
    listForUser(user) {
      return ApiKey.findAll({
        where: { userId: user.id },
        order: [
          ['createdAt', 'DESC'],
          ['id', 'ASC'],
        ],
      });
    },

    async create(user, name) {
      const generated = generateApiKey();
      const apiKey = await sequelize.transaction(async (transaction) => {
        // Conta dentro da transação, com a linha do utilizador bloqueada,
        // para dois pedidos ao mesmo tempo não passarem os dois o limite.
        await sequelize.query('SELECT 1 FROM users WHERE id = :id FOR UPDATE', {
          replacements: { id: user.id },
          transaction,
        });
        const active = await ApiKey.count({ where: { userId: user.id, revokedAt: null }, transaction });
        if (active >= MAX_ACTIVE_KEYS_PER_USER) {
          throw new AppError(
            409,
            'TOO_MANY_API_KEYS',
            `No máximo ${MAX_ACTIVE_KEYS_PER_USER} chaves ativas por conta. Revoga uma para criar outra.`,
          );
        }
        return ApiKey.create(
          { userId: user.id, name, prefix: generated.prefix, keyHash: generated.hash },
          { transaction },
        );
      });
      return { apiKey, key: generated.key };
    },

    async revoke(user, id) {
      // Só as chaves da própria pessoa: uma chave de outra conta "não existe".
      const apiKey = await ApiKey.findOne({ where: { id, userId: user.id } });
      if (!apiKey) throw new AppError(404, 'API_KEY_NOT_FOUND', 'Chave não encontrada.');
      if (!apiKey.revokedAt) {
        apiKey.revokedAt = new Date();
        await apiKey.save();
      }
      return apiKey;
    },

    async verify(rawKey) {
      if (!isWellFormedApiKey(rawKey)) return null;
      const apiKey = await ApiKey.findOne({ where: { keyHash: hashApiKey(rawKey), revokedAt: null } });
      if (!apiKey) return null;

      const now = Date.now();
      if (!apiKey.lastUsedAt || now - apiKey.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
        // Sem esperar e sem falhar o pedido por causa disto.
        void ApiKey.update(
          { lastUsedAt: new Date(now) },
          { where: { id: apiKey.id, [Op.or]: [{ lastUsedAt: null }, { lastUsedAt: { [Op.lt]: new Date(now - LAST_USED_RESOLUTION_MS) } }] } },
        ).catch((err) => console.error('Falha ao atualizar last_used_at', err));
      }
      return apiKey;
    },
  };
}
