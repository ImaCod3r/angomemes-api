import type { Meme } from '../../db/index.js';
import type { UserWithUploads } from './users.service.js';
import type { StorageService } from '../../services/storage/StorageService.js';
import { visibilityOf } from '../memes/memeStatus.js';

/** Meme visto pelo administrador: qualquer estado, com quem enviou e a revisão. */
export function toAdminMemeDto(meme: Meme, storage: StorageService) {
  const ref = { publicId: meme.publicId, resourceType: meme.resourceType, format: meme.format };
  const visibility = visibilityOf(meme.status);
  const isPublic = visibility === 'public';

  return {
    id: meme.id,
    slug: meme.slug,
    type: meme.type,
    title: meme.title,
    status: meme.status,
    tags: (meme.tags ?? []).map((tag) => ({ slug: tag.slug, name: tag.name })),
    uploader: meme.uploader
      ? { id: meme.uploader.id, name: meme.uploader.name, email: meme.uploader.email }
      : null,
    // Pendentes e removidos só por URL temporário; os rejeitados já não têm ficheiro.
    previewUrl: visibility === null ? null : isPublic ? storage.fileUrl(ref) : storage.privateUrl(ref),
    thumbUrl:
      isPublic && meme.type !== 'audio' ? storage.thumbnailUrl({ ...ref, durationMs: meme.durationMs }) : null,
    format: meme.format,
    bytes: meme.bytes,
    durationMs: meme.durationMs,
    width: meme.width,
    height: meme.height,
    rejectionReason: meme.rejectionReason,
    createdAt: meme.createdAt,
    reviewedAt: meme.reviewedAt,
    publishedAt: meme.publishedAt,
  };
}

export function toAdminUserDto(user: UserWithUploads, lockedAdmin: boolean) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    /** Admin por ADMIN_EMAILS: o painel não deixa despromover. */
    lockedAdmin,
    uploadsCount: user.uploadsCount,
    createdAt: user.createdAt,
  };
}
