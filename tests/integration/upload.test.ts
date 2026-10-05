import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { uploadMemeFile } from '../../src/middlewares/upload.js';
import { fixtures } from '../fixtures.js';

// O middleware de multipart sozinho, sem sessão nem base.
const app = express();
app.post('/upload', uploadMemeFile, (req, res) => {
  res.json({ body: req.body, size: req.file?.size ?? null });
});
app.use(errorHandler);

describe('uploadMemeFile', () => {
  it('lê os campos, as tags como lista e o ficheiro', async () => {
    const res = await request(app)
      .post('/upload')
      .field('type', 'gif')
      .field('title', 'Teste')
      .field('tags[]', 'kuduro')
      .field('tags[]', 'semba')
      .attach('file', fixtures.gif, 'meme.gif');

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ type: 'gif', title: 'Teste', tags: ['kuduro', 'semba'] });
    expect(res.body.size).toBe(fixtures.gif.length);
  });

  it('recusa o ficheiro se o campo type não vier antes', async () => {
    const res = await request(app).post('/upload').attach('file', fixtures.gif, 'meme.gif').field('type', 'gif');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TYPE_REQUIRED');
  });

  it('corta o envio que passa o limite do tipo escolhido', async () => {
    const elevenMb = Buffer.concat([fixtures.gif, Buffer.alloc(11 * 1024 * 1024)]);
    const res = await request(app).post('/upload').field('type', 'gif').attach('file', elevenMb, 'grande.gif');

    expect(res.status).toBe(413);
    expect(res.body.error).toEqual({ code: 'FILE_TOO_LARGE', message: 'O ficheiro passa o limite de 10 MB para GIF.' });
  });

  it('recusa mais de um ficheiro', async () => {
    const res = await request(app)
      .post('/upload')
      .field('type', 'gif')
      .attach('file', fixtures.gif, 'a.gif')
      .attach('file', fixtures.gif, 'b.gif');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_UPLOAD');
  });
});
