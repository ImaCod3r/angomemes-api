import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  // Vai no token de sessão; incrementar invalida todas as sessões da conta.
  await qi.addColumn('users', 'session_version', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.removeColumn('users', 'session_version');
};
