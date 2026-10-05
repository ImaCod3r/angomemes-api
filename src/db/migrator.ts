import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize } from './index.js';
import * as createUsers from './migrations/0001-create-users.js';

// Lista explícita em vez de glob: funciona igual com tsx (.ts) e depois do build (.js).
export const migrator = new Umzug({
  migrations: [{ name: '0001-create-users', ...createUsers }],
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});
