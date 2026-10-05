import { describe, expect, it } from 'vitest';
import { MEME_SLUG_MAX, MEME_SLUG_PATTERN, memeSlugBase, pickFreeSlug } from '../../src/modules/memes/slug.js';

describe('memeSlugBase', () => {
  it('normaliza o título', () => {
    expect(memeSlugBase('Ya Mano, Ação!')).toBe('ya-mano-acao');
  });

  it('títulos sem letras nem números dão "meme"', () => {
    expect(memeSlugBase('!!! 😂')).toBe('meme');
  });

  it('corta títulos longos e deixa espaço para o sufixo', () => {
    const slug = memeSlugBase(`${'palavra '.repeat(30)}`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(`${slug}-999`.length).toBeLessThanOrEqual(MEME_SLUG_MAX);
  });

  it('produz sempre um slug que as rotas aceitam', () => {
    for (const title of ['Ya Mano', '  --Zungueira!!  da   Mutamba-- ', '😂', 'Ñ']) {
      expect(memeSlugBase(title), title).toMatch(MEME_SLUG_PATTERN);
    }
  });
});

describe('pickFreeSlug', () => {
  it('usa a base quando está livre', () => {
    expect(pickFreeSlug('ya-mano', [])).toBe('ya-mano');
  });

  it('acrescenta o primeiro sufixo livre', () => {
    expect(pickFreeSlug('ya-mano', ['ya-mano'])).toBe('ya-mano-2');
    expect(pickFreeSlug('ya-mano', ['ya-mano', 'ya-mano-2', 'ya-mano-4'])).toBe('ya-mano-3');
  });

  it('não confunde slugs que só partilham o início', () => {
    expect(pickFreeSlug('ya', ['ya-mano'])).toBe('ya');
  });
});
