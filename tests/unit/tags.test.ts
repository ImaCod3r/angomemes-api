import { describe, expect, it } from 'vitest';
import { normalizeTags, slugifyTag } from '../../src/modules/memes/tags.js';

describe('slugifyTag', () => {
  it('passa a minúsculas e tira acentos', () => {
    expect(slugifyTag('Kuduro Ñice')).toBe('kuduro-nice');
    expect(slugifyTag('Ação Angolana')).toBe('acao-angolana');
  });

  it('troca pontuação e espaços por um só hífen e apara as pontas', () => {
    expect(slugifyTag('  --Zungueira!!  da   Mutamba-- ')).toBe('zungueira-da-mutamba');
  });

  it('corta em 40 caracteres sem deixar hífen no fim', () => {
    const slug = slugifyTag(`${'a'.repeat(39)} b`);
    expect(slug).toBe('a'.repeat(39));
  });

  it('devolve vazio quando não há letras nem números', () => {
    expect(slugifyTag('!!! ???')).toBe('');
  });
});

describe('normalizeTags', () => {
  it('remove repetidas pelo slug e guarda o primeiro nome escrito', () => {
    expect(normalizeTags(['Kuduro', 'kudúro', 'KUDURO', 'Semba'])).toEqual([
      { slug: 'kuduro', name: 'Kuduro' },
      { slug: 'semba', name: 'Semba' },
    ]);
  });

  it('ignora tags sem letras nem números', () => {
    expect(normalizeTags(['???', '  '])).toEqual([]);
  });

  it('junta espaços repetidos no nome', () => {
    expect(normalizeTags(['  Mais   Velho '])).toEqual([{ slug: 'mais-velho', name: 'Mais Velho' }]);
  });
});
