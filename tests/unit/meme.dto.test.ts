import { describe, expect, it } from 'vitest';
import type { Meme, MemeMedia } from '../../src/db/index.js';
import { toMemeDetailDto, toMemeDto } from '../../src/modules/memes/meme.dto.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const storage = new InMemoryStorageService();

function memeWith(uploader: Record<string, unknown> | undefined) {
  return {
    id: 'm1',
    slug: 'ya-mano',
    type: 'image',
    title: 'Ya mano',
    publicId: 'test/abc',
    resourceType: 'image',
    format: 'jpg',
    durationMs: null,
    tags: [],
    uploader,
  } as unknown as Meme;
}

describe('toMemeDetailDto', () => {
  it('mostra quem enviou só com nome, avatar e verificado', () => {
    const dto = toMemeDetailDto(
      memeWith({ id: 'u1', name: 'Edson', avatarUrl: null, role: 'user', email: 'e@example.com', googleSub: 'g' }),
      storage,
    );
    expect(dto.uploader).toEqual({ name: 'Edson', avatarUrl: null, verified: false });
    expect(JSON.stringify(dto)).not.toContain('e@example.com');
    expect(JSON.stringify(dto)).not.toContain('u1');
  });

  it('administrador aparece como verificado', () => {
    const dto = toMemeDetailDto(memeWith({ name: 'Admin', avatarUrl: null, role: 'admin' }), storage);
    expect(dto.uploader?.verified).toBe(true);
  });

  it('sem uploader carregado devolve null', () => {
    expect(toMemeDetailDto(memeWith(undefined), storage).uploader).toBeNull();
  });
});

describe('toMemeDto: media', () => {
  it('meme simples: sem `media` (os URLs de cima já são os do ficheiro)', () => {
    const dto = toMemeDto(memeWith(undefined), storage);
    expect(dto).not.toHaveProperty('media');
  });

  it('coleção: a capa primeiro e depois por posição', () => {
    const meme = memeWith(undefined);
    meme.media = [
      { position: 2, publicId: 'test/c', resourceType: 'image', format: 'png', durationMs: null, width: 1, height: 1 },
      { position: 1, publicId: 'test/b', resourceType: 'image', format: 'webp', durationMs: null, width: 1, height: 1 },
    ] as unknown as MemeMedia[];
    const dto = toMemeDto(meme, storage);
    expect(dto.media?.map((m) => m.fileUrl)).toEqual([
      'https://storage.test/image/test/abc.jpg',
      'https://storage.test/image/test/b.webp',
      'https://storage.test/image/test/c.png',
    ]);
    // Os campos de topo continuam a ser os da capa.
    expect(dto.fileUrl).toBe('https://storage.test/image/test/abc.jpg');
  });
});
