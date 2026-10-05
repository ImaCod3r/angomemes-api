import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';
import { initUser } from './models/User.js';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

initUser(sequelize);

export { User } from './models/User.js';
