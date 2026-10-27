import { v2 as cloudinary } from 'cloudinary';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadTicket, type User } from '../../src/db/index.js';
import { AppError } from '../../src/errors.js';
import { createMemesService } from '../../src/modules/memes/memes.service.js';
import { CloudinaryStorageService } from '../../src/services/storage/CloudinaryStorageService.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const user = { id: '7b0f4c1e-5d7a-4f3e-9a1b-2c3d4e5f6a7b', role: 'user' } as User;
const ticketId = '11111111-1111-4111-8111-111111111111';

describe('CloudinaryStorageService.signUpload', () => {
  const storage = new CloudinaryStorageService('angomemes/test');

  it('assina o public_id na pasta, a entrega privada, os formatos e proíbe substituir', () => {
    const signed = storage.signUpload({
      name: 'abc',
      resourceType: 'video',
      allowedFormats: ['mp4', 'webm'],
      visibility: 'private',
    });

    expect(signed.url).toBe('https://api.cloudinary.com/v1_1/test-cloud/video/upload');
    expect(signed.publicId).toBe('angomemes/test/abc');
    expect(signed.fields).toMatchObject({
      public_id: 'angomemes/test/abc',
      type: 'authenticated',
      allowed_formats: 'mp4,webm',
      overwrite: 'false',
      api_key: 'test-key',
    });
    // A assinatura cobre exatamente os campos enviados (menos a chave e a própria assinatura).
    const { api_key: _key, signature, ...signedParams } = signed.fields;
    expect(signature).toBe(cloudinary.utils.api_sign_request(signedParams, 'test-secret'));
  });

  it('admin: entrega pública', () => {
    const signed = storage.signUpload({ name: 'x', resourceType: 'image', allowedFormats: ['png'], visibility: 'public' });
    expect(signed.fields.type).toBe('upload');
  });
});

describe('claimUpload: o ficheiro confirma-se no storage', () => {
  let storage: InMemoryStorageService;
  let service: ReturnType<typeof createMemesService>;
  const destroyTicket = vi.fn();

  function fakeTicket(type: 'video' | 'image' | 'audio', visibility: 'public' | 'private' = 'private', id = ticketId) {
    return {
      id,
      userId: user.id,
      type,
      resourceType: type === 'image' ? 'image' : 'video',
      publicId: `test/${id}`,
      visibility,
      destroy: destroyTicket,
    } as unknown as UploadTicket;
  }

  beforeEach(() => {
    storage = new InMemoryStorageService();
    service = createMemesService({ storage });
    destroyTicket.mockReset();
    // Sem base: a contagem de verificações "atualiza" todos os tickets pedidos.
    vi.spyOn(UploadTicket, 'update').mockImplementation((async (
      _values: unknown,
      options: { where: { id: string[] } },
    ) => [options.where.id.length]) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function expectRejected(promise: Promise<unknown>, status: number, code: string) {
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status, code });
  }

  const claim = () => service.claimUpload({ user, ticketId, title: 'Ya mano', tagNames: ['kuduro'] });

  it('ticket inexistente, expirado, já reclamado ou de outra conta: 404', async () => {
    const findAll = vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([]);
    await expectRejected(claim(), 404, 'UPLOAD_NOT_FOUND');
    // A procura filtra pelo dono, por não reclamado e por não expirado.
    const where = findAll.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ id: [ticketId], userId: user.id, claimedAt: null });
    expect(where).toHaveProperty('expiresAt');
  });

  it('tags inválidas falham antes de ir à base', async () => {
    const findAll = vi.spyOn(UploadTicket, 'findAll');
    await expectRejected(service.claimUpload({ user, ticketId, title: 'X', tagNames: ['!!!'] }), 400, 'TAGS_REQUIRED');
    expect(findAll).not.toHaveBeenCalled();
  });

  it('ficheiro que ainda não chegou: 409', async () => {
    vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([fakeTicket('image')]);
    await expectRejected(claim(), 409, 'UPLOAD_NOT_RECEIVED');
  });

  it('acima do limite do tipo: apaga o ficheiro e o ticket, 413', async () => {
    vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([fakeTicket('audio')]);
    storage.simulateDirectUpload(`test/${ticketId}`, {
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
      resourceType: 'video',
      visibility: 'private',
      format: 'mp3',
    });
    await expectRejected(claim(), 413, 'FILE_TOO_LARGE');
    expect(storage.files.size).toBe(0);
    expect(destroyTicket).toHaveBeenCalled();
  });

  it('formato que não é do tipo: apaga o ficheiro, 415', async () => {
    vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([fakeTicket('image')]);
    storage.simulateDirectUpload(`test/${ticketId}`, {
      buffer: Buffer.alloc(10),
      resourceType: 'image',
      visibility: 'private',
      format: 'gif',
    });
    await expectRejected(claim(), 415, 'UNSUPPORTED_FORMAT');
    expect(storage.files.size).toBe(0);
  });

  it('ticket que já esgotou as verificações: 429 sem perguntar ao storage', async () => {
    vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([
      Object.assign(fakeTicket('image'), { checks: 3 }),
    ]);
    const getUploaded = vi.spyOn(storage, 'getUploaded');
    await expectRejected(claim(), 429, 'TOO_MANY_CHECKS');
    expect(getUploaded).not.toHaveBeenCalled();
  });

  it('a contagem sobe só nos que ainda têm tentativas; se um pedido ao mesmo tempo ganhou, 429', async () => {
    vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([fakeTicket('image')]);
    const update = vi.spyOn(UploadTicket, 'update').mockResolvedValue([0] as never);
    const getUploaded = vi.spyOn(storage, 'getUploaded');
    await expectRejected(claim(), 429, 'TOO_MANY_CHECKS');
    const where = update.mock.calls[0]![1]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ id: [ticketId] });
    expect(where).toHaveProperty('checks');
    expect(getUploaded).not.toHaveBeenCalled();
  });

  describe('coleção (vários tickets)', () => {
    const otherId = '22222222-2222-4222-8222-222222222222';
    const claimBoth = () =>
      service.claimUploads({ user, ticketIds: [ticketId, otherId], title: 'Ya mano', tagNames: ['kuduro'] });

    function arrive(id: string, format = 'jpg') {
      storage.simulateDirectUpload(`test/${id}`, {
        buffer: Buffer.alloc(10),
        resourceType: 'image',
        visibility: 'private',
        format,
      });
    }

    it('falta um dos tickets: 404', async () => {
      vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([fakeTicket('image')]);
      await expectRejected(claimBoth(), 404, 'UPLOAD_NOT_FOUND');
    });

    it('tickets repetidos: 400 sem ir à base', async () => {
      const findAll = vi.spyOn(UploadTicket, 'findAll');
      await expectRejected(
        service.claimUploads({ user, ticketIds: [ticketId, ticketId], title: 'X', tagNames: ['kuduro'] }),
        400,
        'INVALID_TICKETS',
      );
      expect(findAll).not.toHaveBeenCalled();
    });

    it('mais de 10 ficheiros: 400 sem ir à base', async () => {
      const findAll = vi.spyOn(UploadTicket, 'findAll');
      const ids = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      await expectRejected(
        service.claimUploads({ user, ticketIds: ids, title: 'X', tagNames: ['kuduro'] }),
        400,
        'TOO_MANY_FILES',
      );
      expect(findAll).not.toHaveBeenCalled();
    });

    it('tipos misturados: 400', async () => {
      vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([
        fakeTicket('image'),
        fakeTicket('video', 'private', otherId),
      ]);
      await expectRejected(claimBoth(), 400, 'MIXED_TYPES');
    });

    it('um dos ficheiros ainda não chegou: 409', async () => {
      vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([
        fakeTicket('image'),
        fakeTicket('image', 'private', otherId),
      ]);
      arrive(ticketId);
      await expectRejected(claimBoth(), 409, 'UPLOAD_NOT_RECEIVED');
    });

    it('um ficheiro com formato errado: só esse é apagado, 415', async () => {
      // A base devolve os tickets por outra ordem; o serviço segue a ordem pedida.
      vi.spyOn(UploadTicket, 'findAll').mockResolvedValue([
        fakeTicket('image', 'private', otherId),
        fakeTicket('image'),
      ]);
      arrive(ticketId);
      arrive(otherId, 'gif');
      await expectRejected(claimBoth(), 415, 'UNSUPPORTED_FORMAT');
      expect([...storage.files.keys()]).toEqual([`test/${ticketId}`]);
      expect(destroyTicket).toHaveBeenCalledTimes(1);
    });
  });
});
