import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { z, ZodError } from 'zod';
import { AppError } from '../errors.js';

export const notFound: RequestHandler = () => {
  throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.');
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: z.prettifyError(err) } });
    return;
  }

  if (err instanceof MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
        message: tooLarge ? 'Ficheiro demasiado grande.' : 'Envio inválido: só um ficheiro, no campo "file".',
      },
    });
    return;
  }

  // Erros 4xx do próprio Express (por exemplo JSON mal formado no corpo).
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: 'Pedido inválido.' } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } });
};
