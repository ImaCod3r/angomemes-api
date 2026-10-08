import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Meme, User } from '../../src/db/index.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { createLikesRouter } from '../../src/modules/likes/likes.routes.js';
import type { LikesService } from '../../src/modules/likes/likes.service.js';
import { createMemesRouter } from '../../src/modules/memes/memes.routes.js';
import type { MemesService } from '../../src/modules/memes/memes.service.js';
import { FakeGoogleVerifier } from '../../src/services/google/FakeGoogleVerifier.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const ID = '0f8b7c1e-5d7a-4f3e-9a1b-2c3d4e5f6a7b';
const OTHER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function meme(id: string, slug: string) {
  return {
    id,
    slug,
    type: 'image',
    title: slug,
    status: 'published',
    publicId: `test/${slug}`,
    resourceType: 'image',
    format: 'jpg',
    durationMs: null,
    likesCount: 4,
    tags: [],
  } as unknown as Meme;
}

function stubLikes(): LikesService {
  return {
    like: vi.fn().mockResolvedValue({ liked: true, likesCount: 5 }),
    unlike: vi.fn().mockResolvedValue({ liked: false, likesCount: 4 }),
    likedMemeIds: vi.fn().mockResolvedValue(new Set([ID])),
  };
}

/** Routers de memes e likes com um utilizador já "na sessão", sem base de dados. */
function appAs(loggedIn: boolean, likes = stubLikes()) {
  const memes = {
    listPublished: vi.fn().mockResolvedValue({
      items: [meme(ID, 'ya-mano'), meme(OTHER_ID, 'bue-fixe')],
      page: 1,
      limit: 24,
      total: 2,
      hasMore: false,
    }),
    getPublishedBySlug: vi.fn().mockResolvedValue(meme(ID, 'ya-mano')),
  } as unknown as MemesService;

  const app = express();
  app.use((req, _res, next) => {
    if (loggedIn) req.user = { id: 'u1', role: 'user' } as User;
    next();
  });
  app.use('/memes', createMemesRouter({ memesService: memes, likesService: likes, storage: new InMemoryStorageService() }));
  app.use('/memes', createLikesRouter({ likesService: likes }));
  app.use(errorHandler);
  return { app, likes };
}

describe('likes', () => {
  it('dar ou retirar like sem sessão devolve 401', async () => {
    const app = createApp({ googleVerifier: new FakeGoogleVerifier(), storage: new InMemoryStorageService() });
    expect((await request(app).put(`/memes/${ID}/like`)).status).toBe(401);
    expect((await request(app).delete(`/memes/${ID}/like`)).status).toBe(401);
  });

  it('id que não é UUID devolve 404 sem chegar ao serviço', async () => {
    const { app, likes } = appAs(true);
    for (const res of [await request(app).put('/memes/ya-mano/like'), await request(app).delete('/memes/1/like')]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MEME_NOT_FOUND');
    }
    expect(likes.like).not.toHaveBeenCalled();
    expect(likes.unlike).not.toHaveBeenCalled();
  });

  it('PUT dá like como a conta da sessão e devolve o estado', async () => {
    const { app, likes } = appAs(true);
    const res = await request(app).put(`/memes/${ID}/like`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ liked: true, likesCount: 5 });
    expect(likes.like).toHaveBeenCalledWith('u1', ID);
  });

  it('DELETE retira o like', async () => {
    const { app, likes } = appAs(true);
    const res = await request(app).delete(`/memes/${ID}/like`);
    expect(res.body).toEqual({ liked: false, likesCount: 4 });
    expect(likes.unlike).toHaveBeenCalledWith('u1', ID);
  });

  it('com sessão, a listagem e o detalhe trazem likedByMe e a contagem', async () => {
    const { app } = appAs(true);
    const list = await request(app).get('/memes');
    expect(list.body.items.map((m: { likedByMe: boolean }) => m.likedByMe)).toEqual([true, false]);
    expect(list.body.items[0].likesCount).toBe(4);

    const detail = await request(app).get('/memes/ya-mano');
    expect(detail.body.meme.likedByMe).toBe(true);
  });

  it('sem sessão, likedByMe é sempre false e não se consulta os likes', async () => {
    const { app, likes } = appAs(false);
    const list = await request(app).get('/memes');
    expect(list.body.items.every((m: { likedByMe: boolean }) => m.likedByMe === false)).toBe(true);
    expect(likes.likedMemeIds).not.toHaveBeenCalled();
  });
});
