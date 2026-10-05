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
    type: meme.type,
    title: meme.title,
    tags: tagsDto(meme),
    fileUrl: storage.fileUrl(ref),
    thumbUrl: meme.type === 'audio' ? null : storage.thumbnailUrl({ ...ref, durationMs: meme.durationMs }),
    durationMs: meme.durationMs,
    width: meme.width,
    height: meme.height,
    publishedAt: meme.publishedAt,
  };
}

/** Resposta ao upload: um pendente não tem URL, porque o ficheiro ainda é privado. */
export function toUploadedMemeDto(meme: Meme, storage: StorageService) {
  if (meme.status === 'published') {
    return { ...toMemeDto(meme, storage), status: meme.status };
  }
  return {
    id: meme.id,
    type: meme.type,
    title: meme.title,
    tags: tagsDto(meme),
    status: meme.status,
  };
}
