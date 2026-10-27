import type { Meme } from '../../db/index.js';
import type { MemeType } from '../../db/models/Meme.js';
import type { StorageService } from '../../services/storage/StorageService.js';
import { type MemeFile, memeFiles } from './memeFiles.js';

function tagsDto(meme: Meme) {
  return (meme.tags ?? []).map((tag) => ({ slug: tag.slug, name: tag.name }));
}

/** Um ficheiro do carrossel, com os mesmos URLs que o meme tem para a capa. */
function mediaDto(type: MemeType, file: MemeFile, storage: StorageService) {
  return {
    fileUrl: storage.fileUrl(file),
    displayUrl: type === 'image' ? storage.displayUrl(file) : null,
    thumbUrl: type === 'audio' ? null : storage.thumbnailUrl(file),
    previewUrl: type === 'video' ? storage.hoverPreviewUrl(file) : null,
    durationMs: file.durationMs,
    width: file.width,
    height: file.height,
  };
}

/** Meme publicado, como aparece nas listagens. `likedByMe` é sempre false sem sessão. */
export function toMemeDto(meme: Meme, storage: StorageService, likedByMe = false) {
  const ref = { publicId: meme.publicId, resourceType: meme.resourceType, format: meme.format };
  const files = memeFiles(meme);
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
    /**
     * Só nas coleções: todos os ficheiros, a capa primeiro (2 a 10). Num meme simples não vem,
     * porque repetiria os URLs de cima e aumentaria todas as listagens.
     */
    ...(files.length > 1 && { media: files.map((file) => mediaDto(meme.type, file, storage)) }),
    publishedAt: meme.publishedAt,
    downloadsCount: meme.downloadsCount,
    likesCount: meme.likesCount,
    likedByMe,
  };
}

/**
 * Página de um meme: o mesmo da listagem e quem o enviou.
 * Só nome, username (para o perfil), avatar e se é verificado (administrador); nunca email nem ids internos.
 */
export function toMemeDetailDto(meme: Meme, storage: StorageService, likedByMe = false) {
  const uploader = meme.uploader;
  return {
    ...toMemeDto(meme, storage, likedByMe),
    uploader: uploader
      ? {
          name: uploader.name,
          username: uploader.username,
          avatarUrl: uploader.avatarUrl,
          verified: uploader.role === 'admin',
        }
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
