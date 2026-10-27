import { DataTypes, Op, Sequelize, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  // Coleções: os ficheiros a seguir à capa. A capa (posição 0) continua nas colunas de `memes`.
  await qi.createTable('meme_media', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
    meme_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'memes', key: 'id' },
      onDelete: 'CASCADE',
    },
    position: { type: DataTypes.SMALLINT, allowNull: false },
    public_id: { type: DataTypes.STRING, allowNull: false },
    resource_type: { type: DataTypes.STRING(16), allowNull: false },
    format: { type: DataTypes.STRING(16), allowNull: false },
    bytes: { type: DataTypes.INTEGER, allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    width: { type: DataTypes.INTEGER, allowNull: true },
    height: { type: DataTypes.INTEGER, allowNull: true },
  });
  // O índice único também serve para carregar os ficheiros de cada meme pela ordem.
  await qi.addConstraint('meme_media', {
    type: 'unique',
    name: 'meme_media_meme_position_key',
    fields: ['meme_id', 'position'],
  });
  await qi.addConstraint('meme_media', {
    type: 'check',
    name: 'meme_media_position_check',
    fields: ['position'],
    where: { position: { [Op.gte]: 1 } },
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.dropTable('meme_media');
};
