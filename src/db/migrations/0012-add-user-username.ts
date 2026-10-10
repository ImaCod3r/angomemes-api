import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';
import { pickFreeSlug } from '../../modules/memes/slug.js';
import { usernameBase } from '../../modules/users/username.js';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.addColumn('users', 'username', { type: DataTypes.STRING(40), allowNull: true });

  // Contas que já existem: a partir do nome, as mais antigas ficam com o nome sem sufixo.
  const rows = await qi.sequelize.query<{ id: string; name: string }>(
    'SELECT id, name FROM users ORDER BY created_at ASC, id ASC',
    { type: QueryTypes.SELECT },
  );
  const taken = new Set<string>();
  for (const row of rows) {
    const username = pickFreeSlug(usernameBase(row.name), taken);
    taken.add(username);
    await qi.bulkUpdate('users', { username }, { id: row.id });
  }

  await qi.changeColumn('users', 'username', { type: DataTypes.STRING(40), allowNull: false });
  await qi.addIndex('users', ['username'], { unique: true, name: 'users_username_key' });
  // Página de perfil: os publicados de uma conta, os mais recentes primeiro.
  await qi.sequelize.query(
    "CREATE INDEX IF NOT EXISTS memes_uploader_published_idx ON memes (uploaded_by, published_at DESC, id DESC) WHERE status = 'published'",
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_uploader_published_idx');
  await qi.removeIndex('users', 'users_username_key');
  await qi.removeColumn('users', 'username');
};
