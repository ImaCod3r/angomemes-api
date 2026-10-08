import { DataTypes, Sequelize, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  // Chave composta: no máximo 1 like por conta e por meme, garantido pela base.
  await qi.createTable('likes', {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    meme_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: { model: 'memes', key: 'id' },
      onDelete: 'CASCADE',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
  });
  await qi.addIndex('likes', ['meme_id']);

  // Contagem guardada no meme, atualizada na mesma transação do like, para listar e ordenar sem COUNT.
  await qi.addColumn('memes', 'likes_count', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  // Para a ordenação "populares" dentro de cada aba.
  await qi.sequelize.query(
    'CREATE INDEX memes_status_type_likes_idx ON memes (status, type, likes_count DESC, downloads_count DESC, published_at DESC)',
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_status_type_likes_idx');
  await qi.removeColumn('memes', 'likes_count');
  await qi.dropTable('likes');
};
