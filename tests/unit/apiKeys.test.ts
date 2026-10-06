import { describe, expect, it } from 'vitest';
import { bearerToken, generateApiKey, hashApiKey, isWellFormedApiKey } from '../../src/modules/publicApi/apiKeys.js';

describe('chaves da API', () => {
  it('gera chaves com prefixo reconhecível, únicas e bem formadas', () => {
    const a = generateApiKey();
    const b = generateApiKey();

    expect(a.key).toMatch(/^am_[A-Za-z0-9_-]{32}$/);
    expect(isWellFormedApiKey(a.key)).toBe(true);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 11));
  });

  it('guarda só o hash: SHA-256 em hexadecimal, sem a chave lá dentro', () => {
    const { key, hash } = generateApiKey();

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key.slice(3));
  });

  it('recusa formatos errados sem ir à base', () => {
    for (const value of ['', 'am_curta', `xx_${'a'.repeat(32)}`, `am_${'a'.repeat(33)}`, `am_${'a'.repeat(31)}!`]) {
      expect(isWellFormedApiKey(value), value).toBe(false);
    }
  });

  it('lê o cabeçalho Authorization: Bearer', () => {
    expect(bearerToken('Bearer am_abc')).toBe('am_abc');
    expect(bearerToken('bearer   am_abc  ')).toBe('am_abc');
    expect(bearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});
