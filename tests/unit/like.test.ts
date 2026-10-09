import { describe, expect, it } from 'vitest';
import { escapeLike } from '../../src/db/like.js';

describe('escapeLike', () => {
  it('escapa os wildcards e a barra', () => {
    expect(escapeLike(String.raw`50%_off\x`)).toBe(String.raw`50\%\_off\\x`);
  });

  it('texto sem caracteres especiais fica igual', () => {
    expect(escapeLike('ya mano')).toBe('ya mano');
  });
});
