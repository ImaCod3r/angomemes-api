import type { QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  // Pesquisa por título (ILIKE '%texto%'): sem trigramas, a base lê a tabela inteira.
  await qi.sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await qi.sequelize.query(
    "CREATE INDEX IF NOT EXISTS memes_title_trgm_idx ON memes USING gin (title gin_trgm_ops) WHERE status = 'published'",
  );
  // Listagens sem filtro de tipo (API pública): os outros índices começam por (status, type).
  await qi.sequelize.query(
    "CREATE INDEX IF NOT EXISTS memes_published_recent_idx ON memes (published_at DESC, id DESC) WHERE status = 'published'",
  );
  // Fila de revisão do painel: por estado, os mais antigos primeiro.
  await qi.sequelize.query('CREATE INDEX IF NOT EXISTS memes_status_created_at_idx ON memes (status, created_at)');
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_status_created_at_idx');
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_published_recent_idx');
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_title_trgm_idx');
  // A extensão fica: pode estar a ser usada por outra coisa.
};
