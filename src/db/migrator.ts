import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize } from './index.js';
import * as createUsers from './migrations/0001-create-users.js';
import * as createMemesAndTags from './migrations/0002-create-memes-and-tags.js';
import * as addMemeSlug from './migrations/0003-add-meme-slug.js';
import * as addMemeDownloadsCount from './migrations/0004-add-meme-downloads-count.js';

// Lista explícita em vez de glob: funciona igual com tsx (.ts) e depois do build (.js).
export const migrator = new Umzug({
  migrations: [
    { name: '0001-create-users', ...createUsers },
    { name: '0002-create-memes-and-tags', ...createMemesAndTags },
    { name: '0003-add-meme-slug', ...addMemeSlug },
    { name: '0004-add-meme-downloads-count', ...addMemeDownloadsCount },
  ],
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});
