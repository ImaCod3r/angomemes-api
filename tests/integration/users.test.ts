import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { FakeGoogleVerifier } from '../../src/services/google/FakeGoogleVerifier.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const app = createApp({ googleVerifier: new FakeGoogleVerifier(), storage: new InMemoryStorageService() });

describe('perfis', () => {
  it('GET /users/:username com formato impossível devolve 404 sem tocar na base', async () => {
    for (const path of ['/users/Joao', '/users/-joao', '/users/joao--ngola', `/users/${'a'.repeat(41)}`]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code, path).toBe('USER_NOT_FOUND');
    }
  });

  it('GET /memes com uploader demasiado longo devolve 400', async () => {
    const res = await request(app).get(`/memes?uploader=${'a'.repeat(41)}`);
    expect(res.status).toBe(400);
  });
});
