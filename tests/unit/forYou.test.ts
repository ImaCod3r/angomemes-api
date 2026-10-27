import { describe, expect, it } from 'vitest';
import { FOR_YOU_SQL, spreadByUploader } from '../../src/modules/memes/forYou.js';

const meme = (id: string, uploadedBy: string) => ({ id, uploadedBy });
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('spreadByUploader', () => {
  it('separa dois seguidos da mesma conta, mexendo o mínimo', () => {
    const page = [meme('1', 'a'), meme('2', 'a'), meme('3', 'b'), meme('4', 'c')];
    expect(ids(spreadByUploader(page))).toEqual(['1', '3', '2', '4']);
  });

  it('sem repetidos, a ordem fica igual', () => {
    const page = [meme('1', 'a'), meme('2', 'b'), meme('3', 'c')];
    expect(ids(spreadByUploader(page))).toEqual(['1', '2', '3']);
  });

  it('se só sobrarem da mesma conta, ficam no fim pela ordem original', () => {
    const page = [meme('1', 'a'), meme('2', 'a'), meme('3', 'a'), meme('4', 'b')];
    expect(ids(spreadByUploader(page))).toEqual(['1', '4', '2', '3']);
  });

  it('não perde nem duplica', () => {
    const page = Array.from({ length: 20 }, (_, i) => meme(String(i), String(i % 3)));
    expect(ids(spreadByUploader(page)).sort()).toEqual(ids(page).sort());
  });
});

describe('FOR_YOU_SQL', () => {
  it('só vídeos publicados, com parâmetros em vez de valores colados no SQL', () => {
    expect(FOR_YOU_SQL).toContain("m.status = 'published'");
    expect(FOR_YOU_SQL).toContain("m.type = 'video'");
    for (const param of [':userId', ':exclude', ':seed', ':limit', ':offset']) {
      expect(FOR_YOU_SQL).toContain(param);
    }
  });
});
