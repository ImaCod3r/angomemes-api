import { createApp } from './app.js';
import { env } from './config/env.js';
import { sequelize } from './db/index.js';
import { GoogleAuthVerifier } from './services/google/GoogleAuthVerifier.js';
import { CloudinaryStorageService } from './services/storage/CloudinaryStorageService.js';

await sequelize.authenticate();

const app = createApp({
  googleVerifier: new GoogleAuthVerifier(env.GOOGLE_CLIENT_ID),
  // Uma pasta por ambiente, para os testes manuais não se misturarem com produção.
  storage: new CloudinaryStorageService(`angomemes/${env.NODE_ENV}`),
});

app.listen(env.PORT, () => {
  console.log(`Servidor a correr em http://localhost:${env.PORT}`);
});