import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { concurrencyLimit } from '../../src/middlewares/concurrency.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { createDownloadCountLimit } from '../../src/middlewares/rateLimit.js';
import { requireSameOrigin } from '../../src/middlewares/sameOrigin.js';
import { FakeGoogleVerifier } from '../../src/services/google/FakeGoogleVerifier.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

describe('requireSameOrigin', () => {
  const app = express();
  app.use(requireSameOrigin('http://localhost:3000'));
  app.all('/x', (_req, res) => {
    res.status(204).end();
  });
  app.use(errorHandler);

  it('recusa um POST de outra origem, incluindo Origin: null', async () => {
    for (const origin of ['https://evil.example', 'http://localhost:3001', 'null']) {
      const res = await request(app).post('/x').set('Origin', origin);
      expect(res.status, origin).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
    }
  });

  it('sem Origin, usa o Referer', async () => {
    expect((await request(app).delete('/x').set('Referer', 'https://evil.example/page')).status).toBe(403);
    expect((await request(app).delete('/x').set('Referer', 'http://localhost:3000/admin')).status).toBe(204);
  });

  it('aceita a origem do frontend e pedidos sem Origin nem Referer', async () => {
    expect((await request(app).post('/x').set('Origin', 'http://localhost:3000')).status).toBe(204);
    expect((await request(app).post('/x')).status).toBe(204);
  });

  it('GET de outra origem passa (não muda dados)', async () => {
    expect((await request(app).get('/x').set('Origin', 'https://evil.example')).status).toBe(204);
  });

  it('está montado na API interna e não na pública', async () => {
    const real = createApp({ googleVerifier: new FakeGoogleVerifier(), storage: new InMemoryStorageService() });
    const res = await request(real).post('/auth/logout').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
});

describe('concurrencyLimit', () => {
  it('acima do máximo responde 503 com Retry-After e liberta a vaga no fim', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = express();
    app.post('/up', concurrencyLimit(1), async (_req, res) => {
      await gate;
      res.status(201).end();
    });
    app.use(errorHandler);

    const first = request(app).post('/up').then((r) => r);
    // Dá tempo ao primeiro pedido de ocupar a vaga.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await request(app).post('/up');
    expect(second.status).toBe(503);
    expect(second.headers['retry-after']).toBe('10');

    release();
    expect((await first).status).toBe(201);
    expect((await request(app).post('/up')).status).toBe(201);
  });
});

describe('createDownloadCountLimit', () => {
  const app = express();
  app.get('/memes/:slug/download', createDownloadCountLimit(2), (_req, res) => {
    res.json({ counted: !res.locals.skipDownloadCount });
  });

  it('nunca bloqueia, mas deixa de contar acima do limite por IP e por meme', async () => {
    const counted = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).get('/memes/ya-mano/download');
      expect(res.status).toBe(200);
      counted.push(res.body.counted);
    }
    expect(counted).toEqual([true, true, false, false]);
    // Outro meme tem o seu próprio contador.
    expect((await request(app).get('/memes/outro/download')).body.counted).toBe(true);
  });
});
