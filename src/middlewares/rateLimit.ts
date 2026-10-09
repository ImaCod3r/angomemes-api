import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    error: { code: 'RATE_LIMITED', message: 'Demasiadas tentativas. Tenta de novo daqui a pouco.' },
  },
});

/** Por conta, não por IP: vem sempre depois do requireAuth. */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  skip: () => env.NODE_ENV === 'test',
  message: {
    error: { code: 'RATE_LIMITED', message: 'Enviaste muitos memes na última hora. Tenta mais tarde.' },
  },
});

/** Por conta: chega para quem carrega no coração várias vezes, trava scripts. Depois do requireAuth. */
export const likeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  skip: () => env.NODE_ENV === 'test',
  message: {
    error: { code: 'RATE_LIMITED', message: 'Demasiados likes seguidos. Tenta daqui a pouco.' },
  },
});

/**
 * Descargas: nunca se bloqueiam, mas cada IP só conta `limit` vezes por meme e por hora.
 * Acima disso a descarga continua e `res.locals.skipDownloadCount` fica a true, para
 * ninguém subir um meme nos "Populares" a carregar no link em loop.
 */
export function createDownloadCountLimit(limit = 3) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${req.params.slug ?? ''}`,
    handler: (_req, res, next) => {
      res.locals.skipDownloadCount = true;
      next();
    },
  });
}

/**
 * API pública, por IP e antes de verificar a chave: chaves falsas também gastam uma
 * consulta à base. Folgado (várias chaves podem estar atrás do mesmo IP); o limite
 * a sério continua a ser por chave.
 */
export const publicApiIpRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    error: { code: 'RATE_LIMITED', message: 'Demasiados pedidos deste endereço. Tenta outra vez daqui a pouco.' },
  },
});
