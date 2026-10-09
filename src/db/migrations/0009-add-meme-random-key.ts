import type { QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  // O default é volátil: o Postgres sorteia um valor diferente para cada meme que já existe.
  await qi.sequelize.query('ALTER TABLE memes ADD COLUMN random_key DOUBLE PRECISION NOT NULL DEFAULT random()');
  // GET /memes/random: o primeiro a partir de um ponto ao acaso, dentro do tipo.
  await qi.sequelize.query(
    "CREATE INDEX memes_published_type_random_key_idx ON memes (type, random_key) WHERE status = 'published'",
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: qi }) => {
  await qi.sequelize.query('DROP INDEX IF EXISTS memes_published_type_random_key_idx');
  await qi.removeColumn('memes', 'random_key');
};
