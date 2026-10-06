import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { loadSession } from './middlewares/auth.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createAdminService } from './modules/admin/admin.service.js';
import { createUsersService } from './modules/admin/users.service.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createMemesRouter } from './modules/memes/memes.routes.js';
import { createMemesService } from './modules/memes/memes.service.js';
import { createApiKeysService } from './modules/publicApi/apiKeys.service.js';
import { createMeRouter } from './modules/publicApi/me.routes.js';
import { buildOpenApiSpec } from './modules/publicApi/openapi.js';
import { createPublicApiRouter } from './modules/publicApi/publicApi.routes.js';
import type { GoogleVerifier } from './services/google/GoogleVerifier.js';
import type { StorageService } from './services/storage/StorageService.js';

export interface AppDeps {
  googleVerifier: GoogleVerifier;
  storage: StorageService;
  /** Só para testes: substitui o limite de pedidos da API pública. */
  publicApiRateLimit?: RequestHandler;
}

export function createApp(deps: AppDeps) {
  const app = express();

  app.use(
    helmet({
      // Em desenvolvimento (http) obrigaria o navegador a pedir os ficheiros do /docs por https.
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null },
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  const memesService = createMemesService({ storage: deps.storage });
  const apiKeysService = createApiKeysService();

  // API pública: antes do CORS restrito e da sessão. Tem CORS aberto, sem cookies,
  // e autentica só pela chave.
  const openApiSpec = buildOpenApiSpec('/api/v1');
  app.get('/api/v1/openapi.json', cors(), (_req, res) => {
    res.json(openApiSpec);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Angomemes API' }));
  app.use(
    '/api/v1',
    createPublicApiRouter({
      memesService,
      apiKeysService,
      storage: deps.storage,
      frontendUrl: env.FRONTEND_URL,
      rateLimit: deps.publicApiRateLimit,
    }),
  );

  // API interna: só a origem do frontend, com o cookie de sessão.
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);

  const authService = createAuthService({
    googleVerifier: deps.googleVerifier,
    adminEmails: env.ADMIN_EMAILS,
  });
  app.use('/auth', createAuthRouter({ authService }));

  app.use('/me', createMeRouter({ apiKeysService }));
  app.use('/memes', createMemesRouter({ memesService, storage: deps.storage }));

  const adminService = createAdminService({ storage: deps.storage });
  const usersService = createUsersService({ adminEmails: env.ADMIN_EMAILS });
  app.use('/admin', createAdminRouter({ adminService, usersService, storage: deps.storage }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}