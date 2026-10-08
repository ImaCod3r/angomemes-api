import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';
import { ApiKey, initApiKey } from './models/ApiKey.js';
import { initLike, Like } from './models/Like.js';
import { initMeme, Meme } from './models/Meme.js';
import { initMemeTag, MemeTag } from './models/MemeTag.js';
import { initTag, Tag } from './models/Tag.js';
import { initUser, User } from './models/User.js';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

initUser(sequelize);
initTag(sequelize);
initMeme(sequelize);
initMemeTag(sequelize);
initApiKey(sequelize);
initLike(sequelize);

Meme.belongsTo(User, { as: 'uploader', foreignKey: 'uploadedBy' });
Meme.belongsToMany(Tag, { through: MemeTag, as: 'tags', foreignKey: 'memeId', otherKey: 'tagId' });
Tag.belongsToMany(Meme, { through: MemeTag, as: 'memes', foreignKey: 'tagId', otherKey: 'memeId' });

ApiKey.belongsTo(User, { as: 'user', foreignKey: 'userId' });

export { ApiKey, Like, Meme, MemeTag, Tag, User };
