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
