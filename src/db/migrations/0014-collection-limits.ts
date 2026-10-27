import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  // Quantas vezes o ficheiro de um ticket foi confirmado no storage (Admin API do Cloudinary,
  // com quota por hora). Com um máximo por ticket, ninguém a esgota a reclamar em loop.
  await qi.addColumn('upload_tickets', 'checks', {
    type: DataTypes.SMALLINT,
    allowNull: false,
    defaultValue: 0,
  });
  // Uma coleção tem no máximo 10 ficheiros: a capa e as posições 1 a 9.
  await qi.sequelize.query('ALTER TABLE meme_media DROP CONSTRAINT IF EXISTS meme_media_position_check');
  await qi.sequelize.query(
    'ALTER TABLE meme_media ADD CONSTRAINT meme_media_position_check CHECK (position BETWEEN 1 AND 9)',
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.sequelize.query('ALTER TABLE meme_media DROP CONSTRAINT IF EXISTS meme_media_position_check');
  await qi.sequelize.query('ALTER TABLE meme_media ADD CONSTRAINT meme_media_position_check CHECK (position >= 1)');
  await qi.removeColumn('upload_tickets', 'checks');
};
