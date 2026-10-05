import { Router } from 'express';
import { z } from 'zod';
import { MEME_TYPES } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';
import { requireAuth } from '../../middlewares/auth.js';
import { uploadRateLimit } from '../../middlewares/rateLimit.js';
import { uploadMemeFile } from '../../middlewares/upload.js';
import type { StorageService } from '../../services/storage/StorageService.js';
import { toMemeDto, toUploadedMemeDto } from './meme.dto.js';
import type { MemesService } from './memes.service.js';
import { MAX_TAGS_PER_MEME, TAG_MAX_LENGTH } from './tags.js';

const MAX_PAGE_SIZE = 50;

const emptyToUndefined = (value: string | undefined) => value || undefined;

const listQuery = z.object({
  type: z.enum(MEME_TYPES).optional(),
  q: z.string().trim().max(100).optional().transform(emptyToUndefined),
  tag: z.string().trim().max(TAG_MAX_LENGTH).optional().transform(emptyToUndefined),
  page: z.coerce.number().int().min(1).default(1),
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

export function createMemesRouter(deps: { memesService: MemesService; storage: StorageService }) {
  const { memesService, storage } = deps;
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listQuery.parse(req.query);
    const page = await memesService.listPublished(query);
    res.json({ ...page, items: page.items.map((meme) => toMemeDto(meme, storage)) });
  });

  router.post('/', requireAuth, uploadRateLimit, uploadMemeFile, async (req, res) => {
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

  return router;
}
