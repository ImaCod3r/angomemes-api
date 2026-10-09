import { Router } from 'express';
import { z } from 'zod';
import { MEME_STATUSES, MEME_TYPES } from '../../db/models/Meme.js';
import { ROLES } from '../../db/models/User.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../../middlewares/auth.js';
import type { StorageService } from '../../services/storage/StorageService.js';
import { MAX_TAGS_PER_MEME, TAG_MAX_LENGTH } from '../memes/tags.js';
import { toAdminMemeDto, toAdminUserDto } from './admin.dto.js';
import { MAX_PAGE } from '../memes/memes.service.js';
import type { AdminService } from './admin.service.js';
import type { UsersService } from './users.service.js';

const MAX_PAGE_SIZE = 50;

const emptyToUndefined = (value: string | undefined) => value || undefined;

const listQuery = z.object({
  status: z.enum(MEME_STATUSES).default('pending'),
  type: z.enum(MEME_TYPES).optional(),
  q: z.string().trim().max(100).optional().transform(emptyToUndefined),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(24)
    .transform((value) => Math.min(value, MAX_PAGE_SIZE)),
});

const editsBody = z.object({
  title: z.string().trim().min(1, 'O título é obrigatório.').max(120).optional(),
  tags: z
    .array(z.string().trim().min(1).max(TAG_MAX_LENGTH))
    .min(1, 'Indica pelo menos 1 tag.')
    .max(MAX_TAGS_PER_MEME, `No máximo ${MAX_TAGS_PER_MEME} tags por meme.`)
    .optional(),
});

const usersQuery = z.object({
  role: z.enum(ROLES).optional(),
  q: z.string().trim().max(100).optional().transform(emptyToUndefined),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(24)
    .transform((value) => Math.min(value, MAX_PAGE_SIZE)),
});

const roleBody = z.object({ role: z.enum(ROLES) });

const rejectBody = z.object({
  reason: z.string().trim().min(1, 'Indica o motivo da rejeição.').max(300),
});

/** Um id que não é UUID nunca existe: 404 sem ir à base. */
function parseId(id: string | undefined, what: 'MEME' | 'USER' = 'MEME'): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) {
    throw what === 'MEME'
      ? new AppError(404, 'MEME_NOT_FOUND', 'Meme não encontrado.')
      : new AppError(404, 'USER_NOT_FOUND', 'Utilizador não encontrado.');
  }
  return parsed.data;
}

export function createAdminRouter(deps: {
  adminService: AdminService;
  usersService: UsersService;
  storage: StorageService;
}) {
  const { adminService, usersService, storage } = deps;
  const userDto = (user: Parameters<typeof toAdminUserDto>[0]) =>
    toAdminUserDto(user, usersService.isLockedAdmin(user));
  const router = Router();
  const dto = (meme: Parameters<typeof toAdminMemeDto>[0]) => ({ meme: toAdminMemeDto(meme, storage) });

  // Tudo aqui é só para administradores; o role lê-se da base em cada pedido.
  router.use(requireAdmin);

  /** Números para a visão geral e para os contadores da sidebar. */
  router.get('/stats', async (_req, res) => {
    const [memes, users] = await Promise.all([adminService.counts(), usersService.counts()]);
    res.json({ memes, users });
  });

  router.get('/users', async (req, res) => {
    const query = usersQuery.parse(req.query);
    const page = await usersService.list(query);
    res.json({ ...page, items: page.items.map(userDto) });
  });

  router.patch('/users/:id', async (req, res) => {
    const { role } = roleBody.parse(req.body);
    const user = await usersService.setRole(req.user!, parseId(req.params.id, 'USER'), role);
    res.json({ user: userDto(user) });
  });

  router.get('/memes', async (req, res) => {
    const query = listQuery.parse(req.query);
    const [page, counts] = await Promise.all([adminService.list(query), adminService.counts()]);
    res.json({ ...page, items: page.items.map((meme) => toAdminMemeDto(meme, storage)), counts });
  });

  router.get('/memes/:id', async (req, res) => {
    res.json(dto(await adminService.get(parseId(req.params.id))));
  });

  router.patch('/memes/:id', async (req, res) => {
    const edits = editsBody.parse(req.body);
    res.json(dto(await adminService.edit(parseId(req.params.id), edits)));
  });

  router.post('/memes/:id/approve', async (req, res) => {
    const edits = editsBody.parse(req.body ?? {});
    res.json(dto(await adminService.approve(parseId(req.params.id), req.user!, edits)));
  });

  router.post('/memes/:id/reject', async (req, res) => {
    const { reason } = rejectBody.parse(req.body);
    res.json(dto(await adminService.reject(parseId(req.params.id), req.user!, reason)));
  });

  router.delete('/memes/:id', async (req, res) => {
    res.json(dto(await adminService.remove(parseId(req.params.id), req.user!)));
  });

  return router;
}
