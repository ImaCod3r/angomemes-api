import { createApp } from './app.js';
import { env } from './config/env.js';
import { sequelize } from './db/index.js';
import { GoogleAuthVerifier } from './services/google/GoogleAuthVerifier.js';

await sequelize.authenticate();

const app = createApp({
  googleVerifier: new GoogleAuthVerifier(env.GOOGLE_CLIENT_ID),
});

app.listen(env.PORT, () => {
  console.log(`Servidor a correr em http://localhost:${env.PORT}`);
});