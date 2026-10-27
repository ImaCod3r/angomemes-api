import type { Meme } from '../../db/index.js';
import type { FileRef, StorageService, Visibility } from '../../services/storage/StorageService.js';

export interface MemeFile extends FileRef {
  bytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Todos os ficheiros do meme pela ordem do carrossel: a capa (as colunas do meme) e depois
 * os de `meme_media`. Sem `media` carregado, só a capa.
 */
export function memeFiles(meme: Meme): MemeFile[] {
  const cover: MemeFile = {
    publicId: meme.publicId,
    resourceType: meme.resourceType,
    format: meme.format,
    bytes: meme.bytes,
    durationMs: meme.durationMs,
    width: meme.width,
    height: meme.height,
  };
  const rest = [...(meme.media ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((media) => ({
      publicId: media.publicId,
      resourceType: media.resourceType,
      format: media.format,
      bytes: media.bytes,
      durationMs: media.durationMs,
      width: media.width,
      height: media.height,
    }));
  return [cover, ...rest];
}

/**
 * Muda a visibilidade de vários ficheiros como um todo: se um falhar, os que já mudaram
 * voltam ao estado anterior e o erro sobe. Assim uma coleção nunca fica meio pública.
 */
export async function setVisibilityAll(
  storage: StorageService,
  refs: FileRef[],
  from: Visibility,
  to: Visibility,
): Promise<void> {
  const results = await Promise.allSettled(refs.map((ref) => storage.setVisibility(ref, from, to)));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (!failed) return;
  await Promise.all(
    refs
      .filter((_, index) => results[index]!.status === 'fulfilled')
      .map((ref) =>
        storage
          .setVisibility(ref, to, from)
          .catch((err) => console.error('Falha ao repor a visibilidade', ref.publicId, err)),
      ),
  );
  throw failed.reason;
}
