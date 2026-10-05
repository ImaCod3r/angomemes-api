import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { SESSION_COOKIE } from '../../src/modules/auth/session.js';
import { FakeGoogleVerifier } from '../../src/services/google/FakeGoogleVerifier.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const app = createApp({
  googleVerifier: new FakeGoogleVerifier(),
  storage: new InMemoryStorageService(),
});

function sessionCookie(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

describe('auth', () => {
  it('POST /auth/google sem idToken devolve 400', async () => {
    const res = await request(app).post('/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('token Google inválido é recusado e não cria sessão', async () => {
    const res = await request(app).post('/auth/google').send({ idToken: 'token-falso' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_GOOGLE_TOKEN');
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('GET /auth/me sem sessão devolve 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('cookie de sessão inválido é tratado como visitante', async () => {
    const res = await request(app).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=lixo`);
    expect(res.status).toBe(401);
  });
});
