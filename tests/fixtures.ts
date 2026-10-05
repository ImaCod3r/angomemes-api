/** Cabeçalhos mínimos que o `file-type` reconhece pelo conteúdo. */
const pad = (header: Buffer, size = 4100) => Buffer.concat([header, Buffer.alloc(Math.max(0, size - header.length))]);

export const fixtures = {
  jpg: pad(Buffer.from('ffd8ffe000104a46494600', 'hex')),
  png: pad(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')),
  webp: pad(Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from('24000000', 'hex'), Buffer.from('WEBPVP8 ', 'latin1')])),
  gif: pad(Buffer.from('GIF89a', 'latin1')),
  mp4: pad(Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex')),
  mov: pad(Buffer.from('00000014667479707174202000000000', 'hex')),
  // Etiqueta ID3 de 10 bytes seguida de um frame MPEG-1 Layer III.
  mp3: pad(Buffer.from(`4944330300000000000a${'00'.repeat(10)}fffb9064`, 'hex')),
  wav: pad(Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from('24000000', 'hex'), Buffer.from('WAVEfmt ', 'latin1')])),
  garbage: pad(Buffer.from('isto não é um vídeo', 'utf8')),
};
