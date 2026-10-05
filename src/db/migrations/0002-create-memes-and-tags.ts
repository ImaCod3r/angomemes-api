import { DataTypes, Sequelize, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.createTable('tags', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
    slug: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(40), allowNull: false },
  });

  await qi.createTable('memes', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
    type: { type: DataTypes.STRING(16), allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
    public_id: { type: DataTypes.STRING, allowNull: false },
    resource_type: { type: DataTypes.STRING(16), allowNull: false },
    format: { type: DataTypes.STRING(16), allowNull: false },
    bytes: { type: DataTypes.INTEGER, allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    width: { type: DataTypes.INTEGER, allowNull: true },
    height: { type: DataTypes.INTEGER, allowNull: true },
    uploaded_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    reviewed_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    rejection_reason: { type: DataTypes.STRING(300), allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
  });

  await qi.addConstraint('memes', {
    type: 'check',
    name: 'memes_type_check',
    fields: ['type'],
    where: { type: ['video', 'gif', 'audio'] },
  });
  await qi.addConstraint('memes', {
    type: 'check',
    name: 'memes_status_check',
    fields: ['status'],
    where: { status: ['pending', 'published', 'rejected', 'removed'] },
  });
  await qi.addConstraint('memes', {
    type: 'check',
    name: 'memes_resource_type_check',
    fields: ['resource_type'],
    where: { resource_type: ['video', 'image'] },
  });
  await qi.sequelize.query(
    'CREATE INDEX memes_status_type_published_at_idx ON memes (status, type, published_at DESC)',
  );
  await qi.addIndex('memes', ['uploaded_by']);

  await qi.createTable('meme_tags', {
    meme_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: { model: 'memes', key: 'id' },
      onDelete: 'CASCADE',
    },
    tag_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: { model: 'tags', key: 'id' },
      onDelete: 'CASCADE',
    },
  });
  await qi.addIndex('meme_tags', ['tag_id']);
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.dropTable('meme_tags');
  await qi.dropTable('memes');
  await qi.dropTable('tags');
};
