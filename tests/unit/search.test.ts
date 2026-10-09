import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchTerms } from '../../src/modules/memes/search.js';

describe('pesquisa', () => {
  it('normaliza acentos, maiúsculas e pontuação', () => {
    expect(normalizeSearch('  Ya Mano!! Kúduro, ÇA ')).toBe('ya mano kuduro ca');
  });

  it('tira as palavras vazias e as repetidas', () => {
    expect(searchTerms('O meme do Kuduro kuduro')).toEqual({ phrase: 'o meme do kuduro kuduro', words: ['meme', 'kuduro'] });
  });

  it('só palavras vazias: ficam essas', () => {
    expect(searchTerms('de que')?.words).toEqual(['de', 'que']);
  });

  it('sem letras nem números não há pesquisa', () => {
    expect(searchTerms('?! …')).toBeNull();
  });

  it('corta as palavras a mais', () => {
    expect(searchTerms('um dois tres quatro cinco seis sete oito')?.words).toEqual([
      'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete',
    ]);
  });
});
