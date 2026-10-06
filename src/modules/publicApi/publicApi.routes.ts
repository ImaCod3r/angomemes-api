import cors from 'cors';
import { type RequestHandler, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { ApiKey } from '../../db/index.js';
import { MEME_TYPES } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';
import type { StorageService } from '../../services/storage/StorageService.js';
import type { MemesService } from '../memes/memes.service.js';
import { MEME_SLUG_MAX, MEME_SLUG_PATTERN } from '../memes/slug.js';
import { MEME_SORTS, RANDOM_SEED_MAX } from '../memes/sort.js';
import { TAG_MAX_LENGTH } from '../memes/tags.js';
import { bearerToken } from './apiKeys.js';
import type { ApiKeysService } from './apiKeys.service.js';
import { PUBLIC_API_MAX_PAGE_SIZE, PUBLIC_API_RATE_LIMIT_PER_MINUTE } from './openapi.js';
import { toPublicMemeDto } from './publicApi.dto.js';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

const emptyToUndefined = (value: string | undefined) => value || undefined;

const listQuery = z.object({
  type: z.enum(MEME_TYPES).optional(),
  q: z.string().trim().max(100).optional().transform(emptyToUndefined),
  tag: z.string().trim().max(TAG_MAX_LENGTH).optional().transform(emptyToUndefined),
  sort: z.enum(MEME_SORTS).default('recent'),
  seed: z.coerce.number().int().min(0).max(RANDOM_SEED_MAX).default(0),
  page: z.coerce.number().int().min(1).default(1),
  // Acima do máximo corta-se em vez de dar erro.
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(24)
    .transform((value) => Math.min(value, PUBLIC_API_MAX_PAGE_SIZE)),
});

const randomQuery = z.object({
  type: z.enum(MEME_TYPES).optional(),
  tag: z.string().trim().max(TAG_MAX_LENGTH).optional().transform(emptyToUndefined),
});

const UUID = z.uuid();

function notFound(): AppError {
  return new AppError(404, 'MEME_NOT_FOUND', 'Meme não encontrado.');
}

/** Chave em `Authorization: Bearer`. Sem chave, mal formada, inexistente ou revogada: 401. */
export function requireApiKey(apiKeys: ApiKeysService): RequestHandler {
  return async (req, _res, next) => {
    const raw = bearerToken(req.get('authorization'));
    if (!raw) {
      throw new AppError(
        401,
        'API_KEY_REQUIRED',
        'Falta a chave da API. Envia-a em "Authorization: Bearer <chave>".',
      );
    }
    const apiKey = await apiKeys.verify(raw);
    if (!apiKey) {
      throw new AppError(401, 'INVALID_API_KEY', 'Chave da API inválida ou revogada.');
    }
    req.apiKey = apiKey;
    next();
  };
}

/** Por chave, não por IP. Contador em memória: chega para uma instância. */
export function createPublicApiRateLimit(limit = PUBLIC_API_RATE_LIMIT_PER_MINUTE) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.apiKey!.id,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: `Limite de ${limit} pedidos por minuto ultrapassado. Tenta outra vez daqui a pouco.`,
      },
    },
  });
}

export function createPublicApiRouter(deps: {
  memesService: MemesService;
  apiKeysService: ApiKeysService;
  storage: StorageService;
  frontendUrl: string;
  rateLimit?: RequestHandler;
}) {
  const { memesService, storage, frontendUrl } = deps;
  const router = Router();
  const dto = (meme: Parameters<typeof toPublicMemeDto>[0]) => toPublicMemeDto(meme, storage, frontendUrl);

  // Aberta a qualquer origem, sem cookies: a autenticação é só pela chave.
  router.use(cors({ origin: '*', credentials: false, methods: ['GET'], allowedHeaders: ['Authorization'] }));
  router.use(requireApiKey(deps.apiKeysService));
  router.use(deps.rateLimit ?? createPublicApiRateLimit());

  router.get('/memes', async (req, res) => {
    const query = listQuery.parse(req.query);
    const page = await memesService.listPublished(query);
    res.json({ ...page, items: page.items.map(dto) });
  });

  // Antes de /memes/:idOrSlug, senão "random" seria lido como um slug.
  router.get('/memes/random', async (req, res) => {
    const meme = await memesService.randomPublished(randomQuery.parse(req.query));
    if (!meme) throw new AppError(404, 'MEME_NOT_FOUND', 'Nenhum meme com estes filtros.');
    res.json({ meme: dto(meme) });
  });

  router.get('/memes/:idOrSlug', async (req, res) => {
    const value = req.params.idOrSlug;
    let meme;
    if (UUID.safeParse(value).success) {
      meme = await memesService.getPublishedById(value);
    } else if (value.length <= MEME_SLUG_MAX && MEME_SLUG_PATTERN.test(value)) {
      meme = await memesService.getPublishedBySlug(value);
    } else {
      throw notFound();
    }
    res.json({ meme: dto(meme) });
  });

  router.get('/tags', async (_req, res) => {
    res.json({ items: await memesService.listPublicTags() });
  });

  return router;
}
