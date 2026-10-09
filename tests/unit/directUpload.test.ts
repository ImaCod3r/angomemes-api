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

  function fakeTicket(type: 'video' | 'image' | 'audio', visibility: 'public' | 'private' = 'private') {
    return {
      id: ticketId,
      userId: user.id,
      type,
      resourceType: type === 'image' ? 'image' : 'video',
      publicId: `test/${ticketId}`,
      visibility,
      destroy: destroyTicket,
    } as unknown as UploadTicket;
  }

  beforeEach(() => {
    storage = new InMemoryStorageService();
    service = createMemesService({ storage });
    destroyTicket.mockReset();
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
    const findOne = vi.spyOn(UploadTicket, 'findOne').mockResolvedValue(null);
    await expectRejected(claim(), 404, 'UPLOAD_NOT_FOUND');
    // A procura filtra pelo dono, por não reclamado e por não expirado.
    const where = findOne.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ id: ticketId, userId: user.id, claimedAt: null });
    expect(where).toHaveProperty('expiresAt');
  });

  it('tags inválidas falham antes de ir à base', async () => {
    const findOne = vi.spyOn(UploadTicket, 'findOne');
    await expectRejected(service.claimUpload({ user, ticketId, title: 'X', tagNames: ['!!!'] }), 400, 'TAGS_REQUIRED');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('ficheiro que ainda não chegou: 409', async () => {
    vi.spyOn(UploadTicket, 'findOne').mockResolvedValue(fakeTicket('image'));
    await expectRejected(claim(), 409, 'UPLOAD_NOT_RECEIVED');
  });

  it('acima do limite do tipo: apaga o ficheiro e o ticket, 413', async () => {
    vi.spyOn(UploadTicket, 'findOne').mockResolvedValue(fakeTicket('audio'));
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
    vi.spyOn(UploadTicket, 'findOne').mockResolvedValue(fakeTicket('image'));
    storage.simulateDirectUpload(`test/${ticketId}`, {
      buffer: Buffer.alloc(10),
      resourceType: 'image',
      visibility: 'private',
      format: 'gif',
    });
    await expectRejected(claim(), 415, 'UNSUPPORTED_FORMAT');
    expect(storage.files.size).toBe(0);
  });
});
