import { sequelize } from './index.js';
import { migrator } from './migrator.js';

// Uso: npm run db:migrate (= up) ou npm run db:migrate -- down | pending | executed
const args = process.argv.slice(2);

try {
  await migrator.runAsCLI(args.length > 0 ? args : ['up']);
} finally {
  await sequelize.close();
}
