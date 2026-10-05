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
