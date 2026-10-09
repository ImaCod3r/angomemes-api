import type { RequestHandler } from 'express';
import { User } from '../db/index.js';
import { AppError } from '../errors.js';
import { SESSION_COOKIE, sessionCookieOptions, verifySession } from '../modules/auth/session.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Sessão opcional: se houver cookie válido, carrega o utilizador da base em `req.user`.
 * O role lê-se sempre da base, nunca do token, para uma mudança ter efeito imediato.
 * Um token com versão diferente de `session_version` foi terminado ("sair em todo o lado").
 */
export const loadSession: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string') {
    const claims = verifySession(token);
    const user = claims ? await User.findByPk(claims.userId) : null;
    if (user && user.sessionVersion === claims!.version) {
      req.user = user;
    } else {
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
    }
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'É preciso iniciar sessão.');
  }
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'É preciso iniciar sessão.');
  }
  if (req.user.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Só administradores podem fazer isto.');
  }
  next();
};
