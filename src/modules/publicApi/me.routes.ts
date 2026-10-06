import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { requireAuth } from '../../middlewares/auth.js';
import type { ApiKeysService } from './apiKeys.service.js';
import { toApiKeyDto } from './publicApi.dto.js';

const createBody = z.object({
  name: z.string().trim().min(1, 'Dá um nome à chave (ex.: "Bot do WhatsApp").').max(60),
});

/** Gestão das chaves da própria pessoa (API interna, com sessão). */
export function createMeRouter(deps: { apiKeysService: ApiKeysService }) {
  const { apiKeysService } = deps;
  const router = Router();
  router.use(requireAuth);

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
