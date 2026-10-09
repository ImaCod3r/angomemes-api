import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { requireAuth } from '../../middlewares/auth.js';
import type { LikesService } from '../likes/likes.service.js';
import type { ApiKeysService } from './apiKeys.service.js';
import { toApiKeyDto } from './publicApi.dto.js';

/** No máximo uma página de memes por pedido. */
const MAX_LIKE_IDS = 50;

const likesQuery = z.object({
  memeIds: z
    .string()
    .default('')
    .transform((value) => [...new Set(value.split(',').filter(Boolean))])
    .pipe(z.array(z.uuid()).max(MAX_LIKE_IDS)),
});

const createBody = z.object({
  name: z.string().trim().min(1, 'Dá um nome à chave (ex.: "Bot do WhatsApp").').max(60),
});

/** Dados da própria pessoa (API interna, com sessão): chaves da API e likes. */
export function createMeRouter(deps: { apiKeysService: ApiKeysService; likesService: LikesService }) {
  const { apiKeysService, likesService } = deps;
  const router = Router();
  router.use(requireAuth);

  /**
   * Quais destes memes têm like desta conta. As páginas públicas vêm da cache, iguais
   * para toda a gente; o browser pede isto à parte para pintar os corações.
   */
  router.get('/likes', async (req, res) => {
    const { memeIds } = likesQuery.parse(req.query);
    res.set('Cache-Control', 'private, no-store');
    res.json({ memeIds: [...(await likesService.likedMemeIds(req.user!.id, memeIds))] });
  });

  router.get('/api-keys', async (req, res) => {
    const keys = await apiKeysService.listForUser(req.user!);
    res.json({ items: keys.map(toApiKeyDto) });
  });

  router.post('/api-keys', async (req, res) => {
    const { name } = createBody.parse(req.body);
    const { apiKey, key } = await apiKeysService.create(req.user!, name);
    // A chave completa só vai nesta resposta; depois só existe o hash.
    res.status(201).json({ apiKey: toApiKeyDto(apiKey), key });
  });

  router.delete('/api-keys/:id', async (req, res) => {
    const parsed = z.uuid().safeParse(req.params.id);
    if (!parsed.success) throw new AppError(404, 'API_KEY_NOT_FOUND', 'Chave não encontrada.');
    const apiKey = await apiKeysService.revoke(req.user!, parsed.data);
    res.json({ apiKey: toApiKeyDto(apiKey) });
  });

  return router;
}
