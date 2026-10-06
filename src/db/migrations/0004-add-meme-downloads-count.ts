import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.addColumn('memes', 'downloads_count', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  // Para a ordenação "populares" dentro de cada aba.
  await qi.sequelize.query(
    'CREATE INDEX memes_status_type_downloads_idx ON memes (status, type, downloads_count DESC, published_at DESC)',
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_status_type_downloads_idx');
  await qi.removeColumn('memes', 'downloads_count');
};
