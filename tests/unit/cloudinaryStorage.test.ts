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
