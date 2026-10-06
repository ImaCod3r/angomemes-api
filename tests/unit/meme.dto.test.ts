import { describe, expect, it } from 'vitest';
import type { Meme } from '../../src/db/index.js';
import { toMemeDetailDto } from '../../src/modules/memes/meme.dto.js';
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
