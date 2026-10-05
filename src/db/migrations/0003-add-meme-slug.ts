import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';
import { memeSlugBase, pickFreeSlug } from '../../modules/memes/slug.js';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.addColumn('memes', 'slug', { type: DataTypes.STRING(90), allowNull: true });

  // Memes que já existem: slug a partir do título, os mais antigos ficam com o slug sem sufixo.
  const rows = await qi.sequelize.query<{ id: string; title: string }>(
    'SELECT id, title FROM memes ORDER BY created_at ASC, id ASC',
    { type: QueryTypes.SELECT },
  );
  const taken = new Set<string>();
  for (const row of rows) {
    const slug = pickFreeSlug(memeSlugBase(row.title), taken);
    taken.add(slug);
    await qi.bulkUpdate('memes', { slug }, { id: row.id });
  }

  await qi.changeColumn('memes', 'slug', { type: DataTypes.STRING(90), allowNull: false });
  await qi.addIndex('memes', ['slug'], { unique: true, name: 'memes_slug_key' });
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.removeIndex('memes', 'memes_slug_key');
  await qi.removeColumn('memes', 'slug');
};
