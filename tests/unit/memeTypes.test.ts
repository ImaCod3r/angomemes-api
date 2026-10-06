import { describe, expect, it } from 'vitest';
import { detectFormat, hasWatermark } from '../../src/modules/memes/memeTypes.js';
import { fixtures } from '../fixtures.js';

describe('detectFormat (pelo conteúdo, nunca pela extensão)', () => {
  it('aceita cada formato no tipo certo', async () => {
    expect(await detectFormat('video', fixtures.mp4)).toBe('mp4');
    expect(await detectFormat('image', fixtures.jpg)).toBe('jpg');
    expect(await detectFormat('image', fixtures.png)).toBe('png');
    expect(await detectFormat('image', fixtures.webp)).toBe('webp');
    expect(await detectFormat('audio', fixtures.mp3)).toBe('mp3');
    expect(await detectFormat('audio', fixtures.wav)).toBe('wav');
  });

  it('recusa um formato válido no tipo errado', async () => {
    expect(await detectFormat('video', fixtures.jpg)).toBeNull();
    expect(await detectFormat('image', fixtures.mp4)).toBeNull();
    expect(await detectFormat('audio', fixtures.mp4)).toBeNull();
  });

  it('recusa GIF, .mov e conteúdo que não é media', async () => {
    expect(await detectFormat('image', fixtures.gif)).toBeNull();
    expect(await detectFormat('video', fixtures.mov)).toBeNull();
    expect(await detectFormat('video', fixtures.garbage)).toBeNull();
  });
});

describe('hasWatermark', () => {
  it('vídeos e imagens sim, áudios não', () => {
    expect(hasWatermark('video')).toBe(true);
    expect(hasWatermark('image')).toBe(true);
    expect(hasWatermark('audio')).toBe(false);
  });
});
