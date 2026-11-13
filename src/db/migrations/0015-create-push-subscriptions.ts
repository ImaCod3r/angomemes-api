import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.createTable('push_subscriptions', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    endpoint: { type: DataTypes.TEXT, allowNull: false, unique: true },
    p256dh: { type: DataTypes.TEXT, allowNull: false },
    auth: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('push_subscriptions', ['user_id']);
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.dropTable('push_subscriptions');
};
