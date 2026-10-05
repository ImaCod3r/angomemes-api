import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../../src/db/index.js';
import { AppError } from '../../src/errors.js';
import { createMemesService } from '../../src/modules/memes/memes.service.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';
import { fixtures } from '../fixtures.js';

// Estes casos falham antes de tocar na base; o que importa é o ficheiro nunca chegar ao storage.
const user = { id: '7b0f4c1e-5d7a-4f3e-9a1b-2c3d4e5f6a7b', role: 'user' } as User;

describe('upload: validações antes de enviar para o storage', () => {
  let storage: InMemoryStorageService;
  let service: ReturnType<typeof createMemesService>;

  beforeEach(() => {
    storage = new InMemoryStorageService();
    service = createMemesService({ storage });
  });

  async function expectRejected(promise: Promise<unknown>, status: number, code: string) {
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status, code });
    expect(storage.files.size).toBe(0);
  }

  it('ficheiro .mp4 com conteúdo inválido é recusado', async () => {
    await expectRejected(
      service.upload({ user, type: 'video', title: 'Teste', tagNames: ['kuduro'], file: fixtures.garbage }),
      415,
      'UNSUPPORTED_FORMAT',
    );
  });

  it('imagem enviada como vídeo é recusada', async () => {
    await expectRejected(
      service.upload({ user, type: 'video', title: 'Teste', tagNames: ['kuduro'], file: fixtures.jpg }),
      415,
      'UNSUPPORTED_FORMAT',
    );
  });

  it('GIF é recusado como imagem', async () => {
    await expectRejected(
      service.upload({ user, type: 'image', title: 'Teste', tagNames: ['kuduro'], file: fixtures.gif }),
      415,
      'UNSUPPORTED_FORMAT',
    );
  });

  it('ficheiro acima do limite do tipo é recusado', async () => {
    const tooBig = Buffer.concat([fixtures.mp3, Buffer.alloc(5 * 1024 * 1024)]);
    await expectRejected(
      service.upload({ user, type: 'audio', title: 'Teste', tagNames: ['kuduro'], file: tooBig }),
      413,
      'FILE_TOO_LARGE',
    );
  });

  it('tags que ficam vazias depois de normalizadas são recusadas', async () => {
    await expectRejected(
      service.upload({ user, type: 'image', title: 'Teste', tagNames: ['!!!'], file: fixtures.jpg }),
      400,
      'TAGS_REQUIRED',
    );
  });

  it('mais de 8 tags é recusado', async () => {
    const tagNames = Array.from({ length: 9 }, (_, i) => `tag${i}`);
    await expectRejected(
      service.upload({ user, type: 'image', title: 'Teste', tagNames, file: fixtures.jpg }),
      400,
      'TOO_MANY_TAGS',
    );
  });
});
