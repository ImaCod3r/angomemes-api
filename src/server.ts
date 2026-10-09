import { createApp } from './app.js';
import { env } from './config/env.js';
import { sequelize } from './db/index.js';
import { logger } from './logger.js';
import { createMemesService } from './modules/memes/memes.service.js';
import { GoogleAuthVerifier } from './services/google/GoogleAuthVerifier.js';
import { CloudinaryStorageService } from './services/storage/CloudinaryStorageService.js';

await sequelize.authenticate();

// Uma pasta por ambiente, para os testes manuais não se misturarem com produção.
const storage = new CloudinaryStorageService(`angomemes/${env.NODE_ENV}`);

const app = createApp({
  googleVerifier: new GoogleAuthVerifier(env.GOOGLE_CLIENT_ID),
  storage,
});

/** Envios diretos que ninguém reclamou: o ficheiro apaga-se para não gastar quota. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const memesService = createMemesService({ storage });
const sweep = setInterval(() => {
  memesService
    .sweepExpiredUploads()
    .then((count) => count > 0 && logger.info(`${count} envio(s) expirado(s) apagado(s)`))
    .catch((err) => logger.error({ err }, 'Falha na limpeza de envios expirados'));
}, SWEEP_INTERVAL_MS);
sweep.unref();

const server = app.listen(env.PORT, () => {
  logger.info(`Servidor a correr em http://localhost:${env.PORT}`);
});

/** Num redeploy: deixa de aceitar ligações, acaba os pedidos em curso e só depois fecha a base. */
function shutdown(signal: string) {
  logger.info(`${signal} recebido, a terminar`);
  // Se algum pedido ficar pendurado (um upload lento), não espera para sempre.
  setTimeout(() => process.exit(1), 25_000).unref();
  clearInterval(sweep);
  server.close(async () => {
    await sequelize.close();
    process.exit(0);
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
