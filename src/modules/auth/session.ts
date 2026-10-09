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

export interface SessionClaims {
  userId: string;
  /** Tem de ser igual a `users.session_version`; tokens antigos sem versão contam como 0. */
  version: number;
}

export function signSession(userId: string, version = 0): string {
  return jwt.sign({ ver: version }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** O id do utilizador e a versão da sessão, ou null se o token for inválido ou estiver expirado. */
export function verifySession(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') return null;
    const version = payload.ver ?? 0;
    return Number.isInteger(version) ? { userId: payload.sub, version } : null;
  } catch {
    return null;
  }
}
