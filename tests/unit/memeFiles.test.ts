import { describe, expect, it, vi } from 'vitest';
import type { Meme, MemeMedia } from '../../src/db/index.js';
import { memeFiles, setVisibilityAll } from '../../src/modules/memes/memeFiles.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const ref = (publicId: string) => ({ publicId, resourceType: 'image' as const, format: 'jpg' });

describe('memeFiles', () => {
  it('a capa primeiro e depois os da coleção por posição', () => {
    const meme = {
      publicId: 'capa',
      resourceType: 'image',
      format: 'jpg',
      media: [
        { position: 2, publicId: 'c', resourceType: 'image', format: 'png' },
        { position: 1, publicId: 'b', resourceType: 'image', format: 'png' },
      ] as unknown as MemeMedia[],
    } as unknown as Meme;
    expect(memeFiles(meme).map((file) => file.publicId)).toEqual(['capa', 'b', 'c']);
  });
});

describe('setVisibilityAll', () => {
  it('muda todos', async () => {
    const storage = new InMemoryStorageService();
    await setVisibilityAll(storage, [ref('a'), ref('b')], 'private', 'public');
    expect(storage.visibilityChanges).toEqual([
      { publicId: 'a', from: 'private', to: 'public' },
      { publicId: 'b', from: 'private', to: 'public' },
    ]);
  });

  it('se um falha, os que mudaram voltam atrás e o erro sobe', async () => {
    const storage = new InMemoryStorageService();
    const original = storage.setVisibility.bind(storage);
    vi.spyOn(storage, 'setVisibility').mockImplementation(async (file, from, to) => {
      if (file.publicId === 'b' && to === 'public') throw new Error('falhou');
      return original(file, from, to);
    });

    await expect(setVisibilityAll(storage, [ref('a'), ref('b'), ref('c')], 'private', 'public')).rejects.toThrow(
      'falhou',
    );
    // A e C ficaram públicos e voltaram a privados; B nunca mudou.
    const reverted = storage.visibilityChanges.filter((change) => change.to === 'private').map((c) => c.publicId);
    expect(reverted.sort()).toEqual(['a', 'c']);
  });
});
