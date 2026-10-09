import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize } from './index.js';
import * as createUsers from './migrations/0001-create-users.js';
import * as createMemesAndTags from './migrations/0002-create-memes-and-tags.js';
import * as addMemeSlug from './migrations/0003-add-meme-slug.js';
import * as addMemeDownloadsCount from './migrations/0004-add-meme-downloads-count.js';
import * as createApiKeys from './migrations/0005-create-api-keys.js';
import * as createLikes from './migrations/0006-create-likes.js';
import * as addUserSessionVersion from './migrations/0007-add-user-session-version.js';
import * as performanceIndexes from './migrations/0008-performance-indexes.js';
import * as addMemeRandomKey from './migrations/0009-add-meme-random-key.js';
import * as createUploadTickets from './migrations/0010-create-upload-tickets.js';

// Lista explícita em vez de glob: funciona igual com tsx (.ts) e depois do build (.js).
export const migrator = new Umzug({
  migrations: [
    { name: '0001-create-users', ...createUsers },
    { name: '0002-create-memes-and-tags', ...createMemesAndTags },
    { name: '0003-add-meme-slug', ...addMemeSlug },
    { name: '0004-add-meme-downloads-count', ...addMemeDownloadsCount },
    { name: '0005-create-api-keys', ...createApiKeys },
    { name: '0006-create-likes', ...createLikes },
    { name: '0007-add-user-session-version', ...addUserSessionVersion },
    { name: '0008-performance-indexes', ...performanceIndexes },
    { name: '0009-add-meme-random-key', ...addMemeRandomKey },
    { name: '0010-create-upload-tickets', ...createUploadTickets },
  ],
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});
