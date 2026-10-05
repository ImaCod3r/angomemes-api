import { sequelize } from './index.js';
import { migrator } from './migrator.js';

// Uso: npm run db:migrate -- up | down | pending | executed
try {
  await migrator.runAsCLI();
} finally {
  await sequelize.close();
}
