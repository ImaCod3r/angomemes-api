import type { ApiKey, Meme } from '../../db/index.js';
import type { StorageService } from '../../services/storage/StorageService.js';

/**
 * Meme na API pública. É um contrato com terceiros: só se acrescentam campos,
 * nunca se mudam nem tiram dentro da v1. Nunca inclui quem enviou, estados
 * internos, motivo de rejeição nem o public_id do Cloudinary.
 */
export function toPublicMemeDto(meme: Meme, storage: StorageService, frontendUrl: string) {
  const ref = { publicId: meme.publicId, resourceType: meme.resourceType, format: meme.format };
  return {
    id: meme.id,
    slug: meme.slug,
    type: meme.type,
    title: meme.title,
    tags: (meme.tags ?? []).map((tag) => ({ slug: tag.slug, name: tag.name })),
    fileUrl: storage.fileUrl(ref),
    thumbUrl: meme.type === 'audio' ? null : storage.thumbnailUrl({ ...ref, durationMs: meme.durationMs }),
    previewUrl: meme.type === 'video' ? storage.hoverPreviewUrl(ref) : null,
    downloadUrl: storage.downloadUrl(ref, meme.slug),
    durationMs: meme.durationMs,
    width: meme.width,
    height: meme.height,
    downloadsCount: meme.downloadsCount,
    // Para quem usa a API dar crédito com uma ligação de volta ao acervo.
    pageUrl: `${frontendUrl.replace(/\/$/, '')}/memes/${meme.slug}`,
    publishedAt: meme.publishedAt,
  };
}

export type PublicMemeDto = ReturnType<typeof toPublicMemeDto>;

/** Chave vista pelo dono na página /api. Nunca inclui o hash. */
export function toApiKeyDto(apiKey: ApiKey) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    createdAt: apiKey.createdAt,
    lastUsedAt: apiKey.lastUsedAt,
    revokedAt: apiKey.revokedAt,
  };
}
