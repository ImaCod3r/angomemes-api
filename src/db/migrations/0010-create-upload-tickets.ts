import { DataTypes, Sequelize, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  // Envios diretos do browser para o Cloudinary, à espera de serem reclamados.
  await qi.createTable('upload_tickets', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    type: { type: DataTypes.STRING(16), allowNull: false },
    resource_type: { type: DataTypes.STRING(16), allowNull: false },
    public_id: { type: DataTypes.STRING, allowNull: false, unique: true },
    visibility: { type: DataTypes.STRING(16), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    claimed_at: { type: DataTypes.DATE, allowNull: true },
  });
  // A limpeza procura os que expiraram sem ser reclamados.
  await qi.sequelize.query(
    'CREATE INDEX upload_tickets_unclaimed_expires_idx ON upload_tickets (expires_at) WHERE claimed_at IS NULL',
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.dropTable('upload_tickets');
};
