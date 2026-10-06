import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Meme, User } from '../../src/db/index.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { createAdminRouter } from '../../src/modules/admin/admin.routes.js';
import type { AdminService } from '../../src/modules/admin/admin.service.js';
import type { UsersService } from '../../src/modules/admin/users.service.js';
import { FakeGoogleVerifier } from '../../src/services/google/FakeGoogleVerifier.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const ID = '0f8b7c1e-5d7a-4f3e-9a1b-2c3d4e5f6a7b';

const pendingMeme = {
  id: ID,
  slug: 'ya-mano',
  type: 'image',
  title: 'Ya mano',
  status: 'pending',
  publicId: 'test/abc',
  resourceType: 'image',
  format: 'jpg',
  tags: [],
} as unknown as Meme;

function stubService(): AdminService {
  return {
    list: vi.fn(),
    counts: vi.fn(),
    get: vi.fn().mockResolvedValue(pendingMeme),
    edit: vi.fn().mockResolvedValue(pendingMeme),
    approve: vi.fn().mockResolvedValue(pendingMeme),
    reject: vi.fn().mockResolvedValue(pendingMeme),
    remove: vi.fn().mockResolvedValue(pendingMeme),
  };
}

function stubUsers(): UsersService {
  return {
    list: vi.fn(),
    counts: vi.fn(),
    setRole: vi.fn(),
    isLockedAdmin: vi.fn().mockReturnValue(false),
  };
}

/** O router de admin com um utilizador já "na sessão", sem base de dados. */
function appAs(role: 'user' | 'admin' | null, service = stubService(), users = stubUsers()) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) req.user = { id: 'u1', role } as User;
    next();
  });
  app.use('/admin', createAdminRouter({ adminService: service, usersService: users, storage: new InMemoryStorageService() }));
  app.use(errorHandler);
  return { app, service, users };
}

describe('admin', () => {
  it('sem sessão devolve 401', async () => {
    const app = createApp({ googleVerifier: new FakeGoogleVerifier(), storage: new InMemoryStorageService() });
    const res = await request(app).get('/admin/memes');
    expect(res.status).toBe(401);
  });

  it('utilizador comum devolve 403 em todas as rotas e não chega ao serviço', async () => {
    const { app, service } = appAs('user');
    const calls = [
      request(app).get('/admin/memes'),
      request(app).get(`/admin/memes/${ID}`),
      request(app).patch(`/admin/memes/${ID}`).send({ title: 'x' }),
      request(app).post(`/admin/memes/${ID}/approve`).send({}),
      request(app).post(`/admin/memes/${ID}/reject`).send({ reason: 'x' }),
      request(app).delete(`/admin/memes/${ID}`),
      request(app).get('/admin/stats'),
      request(app).get('/admin/users'),
      request(app).patch(`/admin/users/${ID}`).send({ role: 'admin' }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it('mudar role com valor desconhecido devolve 400', async () => {
    const { app, users } = appAs('admin');
    const res = await request(app).patch(`/admin/users/${ID}`).send({ role: 'superadmin' });
    expect(res.status).toBe(400);
    expect(users.setRole).not.toHaveBeenCalled();
  });

  it('id que não é UUID devolve 404', async () => {
    const { app } = appAs('admin');
    const res = await request(app).post('/admin/memes/abc/approve').send({});
    expect(res.status).toBe(404);
  });

  it('aprovar passa as edições ao serviço e devolve o meme com pré-visualização privada', async () => {
    const { app, service } = appAs('admin');
    const res = await request(app)
      .post(`/admin/memes/${ID}/approve`)
      .send({ title: ' Ya mano ', tags: ['kuduro'] });

    expect(res.status).toBe(200);
    expect(service.approve).toHaveBeenCalledWith(ID, expect.objectContaining({ id: 'u1' }), {
      title: 'Ya mano',
      tags: ['kuduro'],
    });
    expect(res.body.meme.previewUrl).toContain('signed=1');
  });

  it('rejeitar sem motivo devolve 400', async () => {
    const { app, service } = appAs('admin');
    const res = await request(app).post(`/admin/memes/${ID}/reject`).send({ reason: '  ' });
    expect(res.status).toBe(400);
    expect(service.reject).not.toHaveBeenCalled();
  });

  it('editar com lista de tags vazia devolve 400', async () => {
    const { app, service } = appAs('admin');
    const res = await request(app).patch(`/admin/memes/${ID}`).send({ tags: [] });
    expect(res.status).toBe(400);
    expect(service.edit).not.toHaveBeenCalled();
  });
});
