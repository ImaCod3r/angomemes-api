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
