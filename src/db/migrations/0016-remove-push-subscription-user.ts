import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.removeIndex('push_subscriptions', ['user_id']);
  await qi.removeColumn('push_subscriptions', 'user_id');
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.addColumn('push_subscriptions', 'user_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  });
  await qi.addIndex('push_subscriptions', ['user_id']);
};
