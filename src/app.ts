import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { loadSession } from './middlewares/auth.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import type { GoogleVerifier } from './services/google/GoogleVerifier.js';

export interface AppDeps {
  googleVerifier: GoogleVerifier;
}

export function createApp(deps: AppDeps) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(loadSession);

  const authService = createAuthService({
    googleVerifier: deps.googleVerifier,
    adminEmails: env.ADMIN_EMAILS,
  });
  app.use('/auth', createAuthRouter({ authService }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}