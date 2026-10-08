import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { likeRateLimit } from '../../middlewares/rateLimit.js';
import { memeNotFound } from '../memes/memes.service.js';
import type { LikesService } from './likes.service.js';

const UUID = z.uuid();

/** Um id que não é UUID nunca existe: 404 sem ir à base. */
function parseMemeId(id: unknown): string {
  const parsed = UUID.safeParse(id);
  if (!parsed.success) throw memeNotFound();
  return parsed.data;
}

/** PUT e DELETE idempotentes: repetir o pedido deixa tudo igual. Montado em /memes. */
export function createLikesRouter(deps: { likesService: LikesService }) {
  const { likesService } = deps;
  const router = Router();

  router.put('/:id/like', requireAuth, likeRateLimit, async (req, res) => {
    res.json(await likesService.like(req.user!.id, parseMemeId(req.params.id)));
  });

  router.delete('/:id/like', requireAuth, likeRateLimit, async (req, res) => {
    res.json(await likesService.unlike(req.user!.id, parseMemeId(req.params.id)));
  });

  return router;
}
