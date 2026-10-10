import { describe, expect, it } from 'vitest';
import { USERNAME_MAX, USERNAME_PATTERN, usernameBase } from '../../src/modules/users/username.js';

describe('usernameBase', () => {
  it('normaliza o nome', () => {
    expect(usernameBase('João Ngola')).toBe('joao-ngola');
  });

  it('nomes sem letras nem números dão "utilizador"', () => {
    expect(usernameBase('😂 !!')).toBe('utilizador');
  });

  it('corta nomes longos e deixa espaço para o sufixo', () => {
    const username = usernameBase('nome '.repeat(20));
    expect(username.endsWith('-')).toBe(false);
    expect(`${username}-999`.length).toBeLessThanOrEqual(USERNAME_MAX);
  });

  it('produz sempre um username que as rotas aceitam', () => {
    for (const name of ['Ana', '  --Kota!!  do   Kilamba-- ', '😂', 'Ñ']) {
      expect(usernameBase(name), name).toMatch(USERNAME_PATTERN);
    }
  });
});
