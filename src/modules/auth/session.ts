import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  // Em desenvolvimento a API corre em http://localhost, onde o Safari recusa cookies Secure.
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

export function signSession(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** Devolve o id do utilizador, ou null se o token for inválido ou estiver expirado. */
export function verifySession(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
