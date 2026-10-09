import type { Meme } from '../../db/index.js';
import type { StorageService } from '../../services/storage/StorageService.js';

function tagsDto(meme: Meme) {
  return (meme.tags ?? []).map((tag) => ({ slug: tag.slug, name: tag.name }));
}

/** Meme publicado, como aparece nas listagens. `likedByMe` é sempre false sem sessão. */
export function toMemeDto(meme: Meme, storage: StorageService, likedByMe = false) {
  const ref = { publicId: meme.publicId, resourceType: meme.resourceType, format: meme.format };
  return {
    id: meme.id,
    slug: meme.slug,
    type: meme.type,
    title: meme.title,
    tags: tagsDto(meme),
    fileUrl: storage.fileUrl(ref),
    /** Só imagens: reduzida e comprimida, para mostrar na página sem carregar o original. */
    displayUrl: meme.type === 'image' ? storage.displayUrl(ref) : null,
    thumbUrl: meme.type === 'audio' ? null : storage.thumbnailUrl({ ...ref, durationMs: meme.durationMs }),
    previewUrl: meme.type === 'video' ? storage.hoverPreviewUrl(ref) : null,
    /** Pré-visualização dos links partilhados (1200×630). Áudios: o frontend desenha uma. */
    ogImageUrl: meme.type === 'audio' ? null : storage.ogImageUrl({ ...ref, durationMs: meme.durationMs }),
    durationMs: meme.durationMs,
    width: meme.width,
    height: meme.height,
    publishedAt: meme.publishedAt,
    downloadsCount: meme.downloadsCount,
    likesCount: meme.likesCount,
    likedByMe,
  };
}

/**
 * Página de um meme: o mesmo da listagem e quem o enviou.
 * Só nome, avatar e se é verificado (administrador); nunca email nem ids internos.
 */
export function toMemeDetailDto(meme: Meme, storage: StorageService, likedByMe = false) {
  const uploader = meme.uploader;
  return {
    ...toMemeDto(meme, storage, likedByMe),
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
