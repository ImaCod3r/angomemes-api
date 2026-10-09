import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from '../../src/modules/auth/session.js';

const userId = '7b0f4c1e-5d7a-4f3e-9a1b-2c3d4e5f6a7b';

describe('sessão', () => {
  it('um token assinado devolve o id do utilizador e a versão', () => {
    expect(verifySession(signSession(userId))).toEqual({ userId, version: 0 });
    expect(verifySession(signSession(userId, 3))).toEqual({ userId, version: 3 });
  });

  it('um token antigo, sem versão, conta como versão 0', () => {
    const token = jwt.sign({}, process.env.JWT_SECRET!, { subject: userId, algorithm: 'HS256' });
    expect(verifySession(token)).toEqual({ userId, version: 0 });
  });

  it('recusa uma versão que não é inteira', () => {
    const token = jwt.sign({ ver: 'x' }, process.env.JWT_SECRET!, { subject: userId, algorithm: 'HS256' });
    expect(verifySession(token)).toBeNull();
  });

  it('recusa um token alterado', () => {
    const token = signSession(userId);
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(verifySession(tampered)).toBeNull();
  });

  it('recusa um token assinado com outro segredo', () => {
    const token = jwt.sign({}, 'outro-segredo-com-pelo-menos-32-caracteres', { subject: userId });
    expect(verifySession(token)).toBeNull();
  });

  it('recusa um token expirado', () => {
    const token = jwt.sign({}, process.env.JWT_SECRET!, { subject: userId, expiresIn: -10 });
    expect(verifySession(token)).toBeNull();
  });

  it('recusa um token sem assinatura (alg none)', () => {
    const token = jwt.sign({}, '', { subject: userId, algorithm: 'none' });
    expect(verifySession(token)).toBeNull();
  });
});
