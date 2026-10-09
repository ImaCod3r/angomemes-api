import type { QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

// Acentos do português (e mais alguns), em maiúsculas e minúsculas: o lower() não converte
// letras acentuadas em bases com locale C.
const ACCENTED = 'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝáàâãäåéèêëíìîïóòôõöúùûüçñýÿ';
const PLAIN = 'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucnyy';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  // Sem a extensão unaccent (nem sempre se pode instalar): o translate() é nativo e IMMUTABLE,
  // por isso serve num índice.
  await qi.sequelize.query(`
    CREATE OR REPLACE FUNCTION search_normalize(value text) RETURNS text
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
      AS $$ SELECT lower(translate(value, '${ACCENTED}', '${PLAIN}')) $$
  `);
  // A pesquisa passa a comparar o título sem acentos; o índice antigo (título tal e qual) deixa de servir.
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_title_trgm_idx');
  await qi.sequelize.query(
    "CREATE INDEX IF NOT EXISTS memes_title_search_trgm_idx ON memes USING gin (search_normalize(title) gin_trgm_ops) WHERE status = 'published'",
  );
  // Sugestões de tags enquanto se escreve.
  await qi.sequelize.query('CREATE INDEX IF NOT EXISTS tags_slug_trgm_idx ON tags USING gin (slug gin_trgm_ops)');
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.sequelize.query('DROP INDEX IF EXISTS tags_slug_trgm_idx');
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_title_search_trgm_idx');
  await qi.sequelize.query(
    "CREATE INDEX IF NOT EXISTS memes_title_trgm_idx ON memes USING gin (title gin_trgm_ops) WHERE status = 'published'",
  );
  await qi.sequelize.query('DROP FUNCTION IF EXISTS search_normalize(text)');
};
