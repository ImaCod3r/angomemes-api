import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { ApiKey, Meme } from '../../src/db/index.js';
import { errorHandler, notFound } from '../../src/middlewares/errorHandler.js';
import type { MemesService } from '../../src/modules/memes/memes.service.js';
import type { ApiKeysService } from '../../src/modules/publicApi/apiKeys.service.js';
import { buildOpenApiSpec } from '../../src/modules/publicApi/openapi.js';
import { createPublicApiRateLimit, createPublicApiRouter } from '../../src/modules/publicApi/publicApi.routes.js';
import { FakeGoogleVerifier } from '../../src/services/google/FakeGoogleVerifier.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const VALID_KEY = `am_${'k'.repeat(32)}`;
const MEME_ID = '0f8b7c1e-5d7a-4f3e-9a1b-2c3d4e5f6a7b';

// Um meme com todos os campos internos preenchidos, para confirmar que nenhum sai.
const meme = {
  id: MEME_ID,
  slug: 'ya-mano',
  type: 'video',
  title: 'Ya mano',
  status: 'published',
  publicId: 'segredo/public-id',
  resourceType: 'video',
  format: 'mp4',
  bytes: 1234,
  durationMs: 5000,
  width: 640,
  height: 360,
  uploadedBy: 'uploader-uuid',
  reviewedBy: 'reviewer-uuid',
  rejectionReason: 'motivo interno',
  downloadsCount: 7,
  likesCount: 3,
  publishedAt: new Date('2026-10-01T10:00:00Z'),
  tags: [{ slug: 'kuduro', name: 'Kuduro' }],
  uploader: { email: 'pessoa@example.com', name: 'Pessoa' },
} as unknown as Meme;

function stubMemes(): MemesService {
  return {
    listPublished: vi.fn().mockResolvedValue({ items: [meme], page: 1, limit: 50, total: 1, hasMore: false }),
    getPublishedBySlug: vi.fn().mockResolvedValue(meme),
    getPublishedById: vi.fn().mockResolvedValue(meme),
    randomPublished: vi.fn().mockResolvedValue(meme),
    listPublicTags: vi.fn().mockResolvedValue([{ slug: 'kuduro', name: 'Kuduro', memesCount: 1 }]),
    countDownload: vi.fn(),
    upload: vi.fn(),
  };
}

function stubKeys(): ApiKeysService {
  return {
    listForUser: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
    verify: vi.fn(async (raw: string) => (raw === VALID_KEY ? ({ id: 'key-1' } as ApiKey) : null)),
  };
}

function appWith(opts: { rateLimit?: number } = {}) {
  const memes = stubMemes();
  const keys = stubKeys();
  const app = express();
  app.use(
    '/api/v1',
    createPublicApiRouter({
      memesService: memes,
      apiKeysService: keys,
      storage: new InMemoryStorageService(),
      frontendUrl: 'https://angomemes.example/',
      rateLimit: createPublicApiRateLimit(opts.rateLimit ?? 1000),
    }),
  );
  app.use(notFound);
  app.use(errorHandler);
  return { app, memes, keys };
}

const auth = { Authorization: `Bearer ${VALID_KEY}` };

describe('API pública v1', () => {
  it('sem chave devolve 401 API_KEY_REQUIRED', async () => {
    const { app, keys } = appWith();
    const res = await request(app).get('/api/v1/memes');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('API_KEY_REQUIRED');
    expect(keys.verify).not.toHaveBeenCalled();
  });

  it('chave inválida ou revogada devolve 401 INVALID_API_KEY', async () => {
    const { app } = appWith();
    const res = await request(app).get('/api/v1/memes').set('Authorization', `Bearer am_${'x'.repeat(32)}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_API_KEY');
  });

  it('a chave só serve no cabeçalho Bearer, não como cookie nem na query', async () => {
    const { app } = appWith();
    const res = await request(app).get(`/api/v1/memes?key=${VALID_KEY}`).set('Cookie', `session=${VALID_KEY}`);
    expect(res.status).toBe(401);
  });

  it('CORS aberto a qualquer origem, sem credenciais', async () => {
    const { app } = appWith();
    const res = await request(app).get('/api/v1/memes').set(auth).set('Origin', 'https://um-bot.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('limit acima de 50 é cortado a 50', async () => {
    const { app, memes } = appWith();
    await request(app).get('/api/v1/memes?limit=500').set(auth);
    expect(memes.listPublished).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('a resposta nunca inclui campos internos', async () => {
    const { app } = appWith();
    const res = await request(app).get('/api/v1/memes').set(auth);
    const body = JSON.stringify(res.body);
    // O public_id aparece dentro dos URLs do Cloudinary (é assim que o ficheiro se entrega),
    // mas nunca como campo; isso confirma-se no ciclo seguinte.
    for (const secret of ['uploader-uuid', 'reviewer-uuid', 'motivo interno', 'pessoa@example.com']) {
      expect(body, secret).not.toContain(secret);
    }
    for (const field of ['status', 'publicId', 'uploadedBy', 'uploader', 'rejectionReason', 'bytes']) {
      expect(res.body.items[0], field).not.toHaveProperty(field);
    }
  });

  it('contrato: os campos do meme são exatamente os da especificação OpenAPI', async () => {
    const { app } = appWith();
    const res = await request(app).get('/api/v1/memes/ya-mano').set(auth);
    const schema = buildOpenApiSpec('/api/v1').components.schemas.Meme;

    expect(Object.keys(res.body.meme).sort()).toEqual(Object.keys(schema.properties).sort());
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(res.body.meme.pageUrl).toBe('https://angomemes.example/memes/ya-mano');
  });

  it('/memes/random não é lido como slug', async () => {
    const { app, memes } = appWith();
    const res = await request(app).get('/api/v1/memes/random?type=video').set(auth);
    expect(res.status).toBe(200);
    expect(memes.randomPublished).toHaveBeenCalledWith({ type: 'video' });
    expect(memes.getPublishedBySlug).not.toHaveBeenCalled();
  });

  it('detalhe aceita id ou slug; formato impossível dá 404 sem ir à base', async () => {
    const { app, memes } = appWith();
    await request(app).get(`/api/v1/memes/${MEME_ID}`).set(auth);
    expect(memes.getPublishedById).toHaveBeenCalledWith(MEME_ID);

    const res = await request(app).get('/api/v1/memes/Ya_Mano!').set(auth);
    expect(res.status).toBe(404);
    expect(memes.getPublishedBySlug).not.toHaveBeenCalled();
  });

  it('acima do limite devolve 429 com Retry-After', async () => {
    const { app } = appWith({ rateLimit: 2 });
    await request(app).get('/api/v1/tags').set(auth);
    await request(app).get('/api/v1/tags').set(auth);
    const res = await request(app).get('/api/v1/tags').set(auth);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('app: documentação e chaves', () => {
  const app = createApp({ googleVerifier: new FakeGoogleVerifier(), storage: new InMemoryStorageService() });

  it('serve a especificação OpenAPI sem chave', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(['/memes', '/memes/random', '/memes/{idOrSlug}', '/tags']);
  });

  it('gerir chaves exige sessão', async () => {
    for (const call of [
      request(app).get('/me/api-keys'),
      request(app).post('/me/api-keys').send({ name: 'bot' }),
      request(app).delete(`/me/api-keys/${MEME_ID}`),
    ]) {
      expect((await call).status).toBe(401);
    }
  });
});
