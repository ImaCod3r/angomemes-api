import { DataTypes, Sequelize, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.createTable('users', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
    google_sub: { type: DataTypes.STRING, allowNull: false, unique: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    avatar_url: { type: DataTypes.TEXT, allowNull: true },
    role: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'user' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
  });

  await qi.addConstraint('users', {
    type: 'check',
    name: 'users_role_check',
    fields: ['role'],
    where: { role: ['user', 'admin'] },
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.dropTable('users');
};
