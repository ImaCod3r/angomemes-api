import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { authRateLimit } from '../../middlewares/rateLimit.js';
import type { AuthService } from './auth.service.js';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, sessionCookieOptions, signSession } from './session.js';
import { toUserDto } from './user.dto.js';

const googleLoginBody = z.object({
  idToken: z.string().min(1),
});

export function createAuthRouter(deps: { authService: AuthService }) {
  const router = Router();

  // O limite fica só em login e logout: o /me é chamado em cada página renderizada
  // pelo Next.js, e esses pedidos chegam todos do mesmo IP.
  router.post('/google', authRateLimit, async (req, res) => {
    const { idToken } = googleLoginBody.parse(req.body);
    const user = await deps.authService.loginWithGoogle(idToken);

    res.cookie(SESSION_COOKIE, signSession(user.id), {
      ...sessionCookieOptions,
      maxAge: SESSION_MAX_AGE_MS,
    });
    res.json({ user: toUserDto(user) });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: toUserDto(req.user!) });
  });

  router.post('/logout', authRateLimit, (_req, res) => {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
    res.status(204).end();
  });

  return router;
}
