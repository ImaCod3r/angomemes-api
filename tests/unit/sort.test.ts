import { describe, expect, it } from 'vitest';
import { orderFor } from '../../src/modules/memes/sort.js';

describe('orderFor', () => {
  it('recentes: data de publicação e id', () => {
    expect(orderFor('recent', 0)).toEqual([
      ['publishedAt', 'DESC'],
      ['id', 'DESC'],
    ]);
  });

  it('populares: descargas primeiro, depois data e id', () => {
    expect((orderFor('popular', 0) as unknown[][]).map((o) => o[0])).toEqual(['downloadsCount', 'publishedAt', 'id']);
  });

  it('aleatório: a semente entra no SQL só como inteiro', () => {
    const [[expr]] = orderFor('random', 42) as unknown as [[{ val: string }]];
    expect(expr.val).toBe(`md5("Meme"."id"::text || '42')`);
    const [[truncated]] = orderFor('random', 7.9) as unknown as [[{ val: string }]];
    expect(truncated.val).toContain(`'7'`);
  });
});
