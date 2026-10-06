import { DataTypes, Sequelize, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.createTable('api_keys', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING(60), allowNull: false },
    prefix: { type: DataTypes.STRING(16), allowNull: false },
    // SHA-256 em hexadecimal; a chave em claro nunca chega à base.
    key_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    last_used_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  });
  await qi.addIndex('api_keys', ['user_id']);
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.dropTable('api_keys');
};
