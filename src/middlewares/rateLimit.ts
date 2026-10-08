import { rateLimit } from 'express-rate-limit';
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
