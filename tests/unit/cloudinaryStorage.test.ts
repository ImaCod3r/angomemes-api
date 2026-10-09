import { describe, expect, it } from 'vitest';
import { CloudinaryStorageService } from '../../src/services/storage/CloudinaryStorageService.js';

describe('CloudinaryStorageService.downloadUrl', () => {
  const storage = new CloudinaryStorageService('angomemes/test');

  it('pede a descarga com o nome indicado e mantém o formato', () => {
    const url = storage.downloadUrl(
      { publicId: 'angomemes/test/abc', resourceType: 'video', format: 'mp4' },
      'ya-mano',
    );

    expect(url).toContain('/video/upload/');
    expect(url).toContain('fl_attachment:ya-mano');
    expect(url).toContain('angomemes/test/abc.mp4');
  });

});

describe('CloudinaryStorageService.hoverPreviewUrl', () => {
  const storage = new CloudinaryStorageService('angomemes/test');

  it('pré-visualização do vídeo: curta, pequena e sem som', () => {
    const url = storage.hoverPreviewUrl({ publicId: 'angomemes/test/abc', resourceType: 'video', format: 'webm' });

    expect(url).toContain('/video/upload/');
    expect(url).toContain('du_4');
    expect(url).toContain('ac_none');
    expect(url).toContain('w_480');
    expect(url).toContain('angomemes/test/abc.mp4');
  });
});

describe('CloudinaryStorageService.downloadUrl com marca d\'água', () => {
  const storage = new CloudinaryStorageService('angomemes/test');
  const ref = { publicId: 'angomemes/test/abc', resourceType: 'video' as const, format: 'mp4' };

  it('acrescenta o texto pequeno, semitransparente, no canto inferior direito', () => {
    const url = storage.downloadUrl(ref, 'ya-mano', { watermark: true });

    expect(url).toContain('l_text:Arial_64_bold_stroke:angomemes');
    expect(url).toContain('o_70');
    expect(url).toContain('w_0.18');
    expect(url).toContain('fl_layer_apply,g_south_east');
    // A descarga continua a ter o nome certo, depois da marca.
    expect(url.indexOf('fl_layer_apply')).toBeLessThan(url.indexOf('fl_attachment:ya-mano'));
  });

  it('sem a opção não há marca', () => {
    expect(storage.downloadUrl(ref, 'ya-mano')).not.toContain('l_text');
  });
});

describe('CloudinaryStorageService: URLs assinados e comprimidos', () => {
  const storage = new CloudinaryStorageService('angomemes/test');
  const image = { publicId: 'angomemes/test/img', resourceType: 'image' as const, format: 'png' };
  const video = { publicId: 'angomemes/test/vid', resourceType: 'video' as const, format: 'mp4' };

  it('todos os URLs públicos levam assinatura (strict transformations)', () => {
    const urls = [
      storage.fileUrl(image),
      storage.displayUrl(image),
      storage.downloadUrl(video, 'ya-mano', { watermark: true }),
      storage.hoverPreviewUrl(video),
      storage.thumbnailUrl({ ...image, durationMs: null }),
      storage.thumbnailUrl({ ...video, durationMs: 5000 }),
    ];
    for (const url of urls) expect(url, url).toMatch(/\/s--[A-Za-z0-9_-]{8}--\//);
  });

  it('miniaturas e imagem da página com formato e qualidade automáticos', () => {
    expect(storage.thumbnailUrl({ ...image, durationMs: null })).toContain('f_auto');
    expect(storage.thumbnailUrl({ ...video, durationMs: 5000 })).toContain('q_auto');
    const display = storage.displayUrl(image);
    expect(display).toContain('w_1280');
    expect(display).toContain('c_limit');
    expect(display).toContain('f_auto');
  });

  it('displayUrl de um vídeo é o próprio ficheiro', () => {
    expect(storage.displayUrl(video)).toBe(storage.fileUrl(video));
  });
});
