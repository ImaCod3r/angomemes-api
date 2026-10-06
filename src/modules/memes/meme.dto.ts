import type { Meme } from '../../db/index.js';
import type { StorageService } from '../../services/storage/StorageService.js';

function tagsDto(meme: Meme) {
  return (meme.tags ?? []).map((tag) => ({ slug: tag.slug, name: tag.name }));
}

/** Meme publicado, como aparece nas listagens. */
export function toMemeDto(meme: Meme, storage: StorageService) {
  const ref = { publicId: meme.publicId, resourceType: meme.resourceType, format: meme.format };
  return {
    id: meme.id,
    slug: meme.slug,
    type: meme.type,
    title: meme.title,
    tags: tagsDto(meme),
    fileUrl: storage.fileUrl(ref),
    thumbUrl: meme.type === 'audio' ? null : storage.thumbnailUrl({ ...ref, durationMs: meme.durationMs }),
    durationMs: meme.durationMs,
    width: meme.width,
    height: meme.height,
    publishedAt: meme.publishedAt,
    downloadsCount: meme.downloadsCount,
  };
}

/**
 * Página de um meme: o mesmo da listagem e quem o enviou.
 * Só nome, avatar e se é verificado (administrador); nunca email nem ids internos.
 */
export function toMemeDetailDto(meme: Meme, storage: StorageService) {
  const uploader = meme.uploader;
  return {
    ...toMemeDto(meme, storage),
    uploader: uploader
      ? { name: uploader.name, avatarUrl: uploader.avatarUrl, verified: uploader.role === 'admin' }
      : null,
  };
}

/** Resposta ao upload: um pendente não tem URL, porque o ficheiro ainda é privado. */
export function toUploadedMemeDto(meme: Meme, storage: StorageService) {
  if (meme.status === 'published') {
    return { ...toMemeDto(meme, storage), status: meme.status };
  }
  return {
    id: meme.id,
    slug: meme.slug,
    type: meme.type,
    title: meme.title,
    tags: tagsDto(meme),
    status: meme.status,
  };
}
