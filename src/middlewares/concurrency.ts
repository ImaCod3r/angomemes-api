import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

/**
 * No máximo `max` pedidos destes ao mesmo tempo nesta instância. Serve para os uploads,
 * que guardam o ficheiro inteiro em memória (até 50 MB cada): acima do limite responde 503
 * em vez de deixar a memória crescer sem fim.
 */
export function concurrencyLimit(max: number, retryAfterSeconds = 10): RequestHandler {
  let active = 0;
  return (_req, res, next) => {
    if (active >= max) {
      res.set('Retry-After', String(retryAfterSeconds));
      throw new AppError(503, 'BUSY', 'Estamos a receber muitos envios agora. Tenta outra vez daqui a pouco.');
    }
    active++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active--;
    };
    // `close` cobre também a ligação cortada a meio do envio.
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}
