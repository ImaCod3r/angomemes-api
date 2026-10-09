import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  // A sessão e as chaves da API nunca vão para os registos.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[oculto]',
  },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});

export const httpLogger = pinoHttp({
  logger,
  // O /health é chamado pelo alojamento a toda a hora.
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
});
