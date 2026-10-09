import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Proteção CSRF da API interna, além do SameSite=Lax: um pedido que muda dados e vem
 * de outra origem (incluindo outro subdomínio do mesmo site) é recusado.
 * Os browsers mandam sempre `Origin` (ou pelo menos `Referer`) num POST/PUT/PATCH/DELETE;
 * sem nenhum dos dois o pedido não vem de um browser e não leva o cookie de outra pessoa.
 */
export function requireSameOrigin(allowedOrigin: string): RequestHandler {
  const allowed = originOf(allowedOrigin);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    const referer = req.get('referer');
    // `Origin: null` (iframes com sandbox, redirecionamentos) também é recusado.
    const source = origin !== undefined ? originOf(origin) : referer !== undefined ? originOf(referer) : undefined;
    if (source !== undefined && source !== allowed) {
      throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Pedido recusado: origem não autorizada.');
    }
    next();
  };
}
