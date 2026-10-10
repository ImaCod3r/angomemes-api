import { Router } from 'express';
import { z } from 'zod';
import type { User } from '../../db/index.js';
import { MEME_TYPES } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';
import { requireAuth } from '../../middlewares/auth.js';
import { concurrencyLimit } from '../../middlewares/concurrency.js';
import { createDownloadCountLimit, uploadRateLimit } from '../../middlewares/rateLimit.js';
import { uploadMemeFile } from '../../middlewares/upload.js';
import type { StorageService } from '../../services/storage/StorageService.js';
import type { LikesService } from '../likes/likes.service.js';
import { USERNAME_MAX } from '../users/username.js';
import { toMemeDetailDto, toMemeDto, toUploadedMemeDto } from './meme.dto.js';
import { hasWatermark } from './memeTypes.js';
import { MAX_PAGE, memeNotFound, type MemesService } from './memes.service.js';
import { MEME_SLUG_MAX, MEME_SLUG_PATTERN } from './slug.js';
import { MEME_SORTS, RANDOM_SEED_MAX } from './sort.js';
import { MAX_TAGS_PER_MEME, TAG_MAX_LENGTH } from './tags.js';

const MAX_PAGE_SIZE = 50;
/** Com menos letras as sugestões seriam quase todos os memes. */
const MIN_SUGGESTION_LENGTH = 2;
const MAX_SUGGESTED_MEMES = 8;
/** Uploads em curso ao mesmo tempo nesta instância (cada um fica em memória até 50 MB). */
const MAX_CONCURRENT_UPLOADS = 4;

const emptyToUndefined = (value: string | undefined) => value || undefined;

const listQuery = z.object({
  type: z.enum(MEME_TYPES).optional(),
  q: z.string().trim().max(100).optional().transform(emptyToUndefined),
  tag: z.string().trim().max(TAG_MAX_LENGTH).optional().transform(emptyToUndefined),
  // Um username com formato impossível nunca existe: nenhum meme, sem erro.
  uploader: z.string().trim().max(USERNAME_MAX).optional().transform(emptyToUndefined),
  // Sem ordem: os mais relevantes se houver pesquisa, os mais recentes se não.
  sort: z.enum(MEME_SORTS).optional(),
  seed: z.coerce.number().int().min(0).max(RANDOM_SEED_MAX).default(0),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  // Acima do máximo corta-se em vez de dar erro.
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(24)
    .transform((value) => Math.min(value, MAX_PAGE_SIZE)),
});

const uploadBody = z.object({
  type: z.enum(MEME_TYPES),
  title: z.string().trim().min(1, 'O título é obrigatório.').max(120),
  // Aceita `tags[]` (vira array) ou um único `tags`.
  tags: z.preprocess(
    (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
    z
      .array(z.string().trim().min(1).max(TAG_MAX_LENGTH))
      .min(1, 'Indica pelo menos 1 tag.')
      .max(MAX_TAGS_PER_MEME, `No máximo ${MAX_TAGS_PER_MEME} tags por meme.`),
  ),
});

const ticketBody = z.object({ type: z.enum(MEME_TYPES) });

const claimBody = uploadBody.omit({ type: true });

/** Um slug com formato impossível nunca existe: 404 sem ir à base. */
function parseMemeSlug(slug: unknown): string {
  if (typeof slug !== 'string' || slug.length > MEME_SLUG_MAX || !MEME_SLUG_PATTERN.test(slug)) throw memeNotFound();
  return slug;
}

export function createMemesRouter(deps: {
  memesService: MemesService;
  likesService: LikesService;
  storage: StorageService;
}) {
  const { memesService, likesService, storage } = deps;
  const router = Router();
  const downloadCountLimit = createDownloadCountLimit();
  const uploadSlots = concurrencyLimit(MAX_CONCURRENT_UPLOADS);

  /** Com sessão, os memes a que a conta deu like; sem sessão, nenhum. */
  async function likedBy(user: User | undefined, memeIds: string[]): Promise<Set<string>> {
    return user ? likesService.likedMemeIds(user.id, memeIds) : new Set();
  }

  router.get('/', async (req, res) => {
    const query = listQuery.parse(req.query);
    const page = await memesService.listPublished(query);
    const liked = await likedBy(req.user, page.items.map((meme) => meme.id));
    res.json({ ...page, items: page.items.map((meme) => toMemeDto(meme, storage, liked.has(meme.id))) });
  });

  const tagsQuery = z.object({ type: z.enum(MEME_TYPES).optional() });

  const suggestionsQuery = z.object({
    q: z.string().trim().max(100).default(''),
    type: z.enum(MEME_TYPES).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_SUGGESTED_MEMES).default(MAX_SUGGESTED_MEMES),
  });

  // Para o sitemap.xml do frontend: só o necessário de cada meme publicado.
  router.get('/sitemap', async (_req, res) => {
    const memes = await memesService.listForSitemap();
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      items: memes.map((meme) => {
        const ref = { publicId: meme.publicId, resourceType: meme.resourceType, format: meme.format };
        return {
          slug: meme.slug,
          title: meme.title,
          type: meme.type,
          fileUrl: storage.fileUrl(ref),
          thumbUrl: meme.type === 'audio' ? null : storage.thumbnailUrl({ ...ref, durationMs: meme.durationMs }),
          durationMs: meme.durationMs,
          publishedAt: meme.publishedAt,
        };
      }),
    });
  });

  // Sugestões enquanto se escreve na pesquisa. Iguais para toda a gente: sem likes e em cache.
  router.get('/suggestions', async (req, res) => {
    const { q, type, limit } = suggestionsQuery.parse(req.query);
    const result =
      q.length < MIN_SUGGESTION_LENGTH ? { tags: [], memes: [] } : await memesService.suggest({ q, type, limit });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      tags: result.tags,
      memes: result.memes.map((meme) => ({
        slug: meme.slug,
        title: meme.title,
        type: meme.type,
        thumbUrl:
          meme.type === 'audio'
            ? null
            : storage.thumbnailUrl({
                publicId: meme.publicId,
                resourceType: meme.resourceType,
                format: meme.format,
                durationMs: meme.durationMs,
              }),
      })),
    });
  });

  // Esta, a de cima e /sitemap ficam antes de /:slug, senão "tags", "sitemap" e "suggestions" seriam lidos como slugs.
  router.get('/tags', async (req, res) => {
    const { type } = tagsQuery.parse(req.query);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ items: await memesService.listPublicTags(type) });
  });

  router.get('/:slug', async (req, res) => {
    const meme = await memesService.getPublishedBySlug(parseMemeSlug(req.params.slug));
    const liked = await likedBy(req.user, [meme.id]);
    res.json({ meme: toMemeDetailDto(meme, storage, liked.has(meme.id)) });
  });

  router.get('/:slug/download', downloadCountLimit, async (req, res) => {
    const meme = await memesService.getPublishedBySlug(parseMemeSlug(req.params.slug));
    const ref = { publicId: meme.publicId, resourceType: meme.resourceType, format: meme.format };
    // Sem esperar: a descarga não fica à espera da contagem.
    if (!res.locals.skipDownloadCount) void memesService.countDownload(meme);
    res.redirect(302, storage.downloadUrl(ref, meme.slug, { watermark: hasWatermark(meme.type) }));
  });

  router.post('/', requireAuth, uploadRateLimit, uploadSlots, uploadMemeFile, async (req, res) => {
    const body = uploadBody.parse(req.body);
    if (!req.file?.buffer) {
      throw new AppError(400, 'FILE_REQUIRED', 'Falta o ficheiro (campo "file").');
    }

    const meme = await memesService.upload({
      user: req.user!,
      type: body.type,
      title: body.title,
      tagNames: body.tags,
      file: req.file.buffer,
    });
    res.status(201).json({ meme: toUploadedMemeDto(meme, storage) });
  });

  // Envio direto: o browser manda o ficheiro ao Cloudinary e a API nunca o recebe.
  // 1) pede-se um ticket com o tipo; 2) envia-se para `uploadUrl`; 3) reclama-se com título e tags.
  router.post('/uploads', requireAuth, uploadRateLimit, async (req, res) => {
    const { type } = ticketBody.parse(req.body);
    res.status(201).json(await memesService.createUploadTicket(req.user!, type));
  });

  router.post('/uploads/:ticketId', requireAuth, async (req, res) => {
    const ticketId = z.uuid().safeParse(req.params.ticketId);
    if (!ticketId.success) throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Envio não encontrado ou expirado.');
    const body = claimBody.parse(req.body);
    const meme = await memesService.claimUpload({
      user: req.user!,
      ticketId: ticketId.data,
      title: body.title,
      tagNames: body.tags,
    });
    res.status(201).json({ meme: toUploadedMemeDto(meme, storage) });
  });

  return router;
}
