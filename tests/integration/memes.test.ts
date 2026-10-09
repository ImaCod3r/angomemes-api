import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { FakeGoogleVerifier } from '../../src/services/google/FakeGoogleVerifier.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';
import { fixtures } from '../fixtures.js';

const storage = new InMemoryStorageService();
const app = createApp({ googleVerifier: new FakeGoogleVerifier(), storage });

describe('memes', () => {
  it('POST /memes sem sessão devolve 401 e não guarda nada', async () => {
    const res = await request(app)
      .post('/memes')
      .field('type', 'image')
      .field('title', 'Teste')
      .field('tags[]', 'kuduro')
      .attach('file', fixtures.jpg, 'meme.jpg');

    expect(res.status).toBe(401);
    expect(storage.files.size).toBe(0);
  });

  it('GET /memes com tipo desconhecido devolve 400', async () => {
    const res = await request(app).get('/memes?type=sticker');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /memes com ordenação desconhecida ou semente inválida devolve 400', async () => {
    for (const qs of ['sort=likes', 'sort=random&seed=-1', 'sort=random&seed=abc', "sort=random&seed=1'--"]) {
      const res = await request(app).get(`/memes?${qs}`);
      expect(res.status, qs).toBe(400);
    }
  });

  it('GET /memes com página inválida devolve 400', async () => {
    for (const page of ['0', '-1', 'abc', '1.5']) {
      const res = await request(app).get(`/memes?page=${page}`);
      expect(res.status, `page=${page}`).toBe(400);
    }
  });

  it('GET /memes/:slug com slug de formato impossível devolve 404 sem tocar na base', async () => {
    const paths = ['/memes/Ya_Mano', '/memes/-ya-mano', '/memes/ya--mano/download', `/memes/${'a'.repeat(91)}`];
    for (const path of paths) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code, path).toBe('MEME_NOT_FOUND');
    }
  });
  it('GET /memes/tags com tipo desconhecido devolve 400', async () => {
    const res = await request(app).get('/memes/tags?type=sticker');
    expect(res.status).toBe(400);
  });

  it('GET /me/likes sem sessão devolve 401', async () => {
    const res = await request(app).get('/me/likes?memeIds=7b0f4c1e-5d7a-4f3e-9a1b-2c3d4e5f6a7b');
    expect(res.status).toBe(401);
  });

  it('GET /memes com página acima do máximo devolve 400', async () => {
    const res = await request(app).get('/memes?page=1001');
    expect(res.status).toBe(400);
  });

  it('POST /memes de outra origem é recusado antes da sessão', async () => {
    const res = await request(app).post('/memes').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
  it('envio direto sem sessão devolve 401 (pedir ticket e reclamar)', async () => {
    expect((await request(app).post('/memes/uploads').send({ type: 'video' })).status).toBe(401);
    const claim = await request(app)
      .post('/memes/uploads/7b0f4c1e-5d7a-4f3e-9a1b-2c3d4e5f6a7b')
      .send({ title: 'X', tags: ['kuduro'] });
    expect(claim.status).toBe(401);
  });
});
