import { describe, expect, it } from 'vitest';
import { detectFormat } from '../../src/modules/memes/memeTypes.js';
import { fixtures } from '../fixtures.js';

describe('detectFormat (pelo conteúdo, nunca pela extensão)', () => {
  it('aceita cada formato no tipo certo', async () => {
    expect(await detectFormat('video', fixtures.mp4)).toBe('mp4');
    expect(await detectFormat('gif', fixtures.gif)).toBe('gif');
    expect(await detectFormat('audio', fixtures.mp3)).toBe('mp3');
    expect(await detectFormat('audio', fixtures.wav)).toBe('wav');
  });

  it('recusa um formato válido no tipo errado', async () => {
    expect(await detectFormat('video', fixtures.gif)).toBeNull();
    expect(await detectFormat('gif', fixtures.mp4)).toBeNull();
    expect(await detectFormat('audio', fixtures.mp4)).toBeNull();
  });

  it('recusa .mov, imagens e conteúdo que não é media', async () => {
    expect(await detectFormat('video', fixtures.mov)).toBeNull();
    expect(await detectFormat('gif', fixtures.png)).toBeNull();
    expect(await detectFormat('video', fixtures.garbage)).toBeNull();
  });
});
