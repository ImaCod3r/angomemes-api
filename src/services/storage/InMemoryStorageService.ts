import { randomUUID } from 'node:crypto';
import type { FileRef, StorageService, StoredFile, UploadInput, Visibility } from './StorageService.js';

/** Versão em memória para testes: guarda o que foi enviado e devolve URLs falsos. */
export class InMemoryStorageService implements StorageService {
  readonly files = new Map<string, UploadInput>();

  async upload(input: UploadInput): Promise<StoredFile> {
    const publicId = `test/${randomUUID()}`;
    this.files.set(publicId, input);
    return {
      publicId,
      format: input.allowedFormats[0]!,
      bytes: input.buffer.length,
      durationMs: null,
      width: null,
      height: null,
    };
  }

  async destroy(file: FileRef): Promise<void> {
    this.files.delete(file.publicId);
  }

  /** Mudanças de visibilidade pedidas, para os testes confirmarem a chamada certa. */
  readonly visibilityChanges: { publicId: string; from: Visibility; to: Visibility }[] = [];

  async setVisibility(file: FileRef, from: Visibility, to: Visibility): Promise<void> {
    this.visibilityChanges.push({ publicId: file.publicId, from, to });
    const stored = this.files.get(file.publicId);
    if (stored) stored.visibility = to;
  }

  privateUrl(file: FileRef): string {
    return `${this.fileUrl(file)}?signed=1`;
  }

  fileUrl(file: FileRef): string {
    return `https://storage.test/${file.resourceType}/${file.publicId}.${file.format}`;
  }

  downloadUrl(file: FileRef, filename: string, options: { watermark?: boolean } = {}): string {
    return `${this.fileUrl(file)}?download=${filename}${options.watermark ? '&watermark=1' : ''}`;
  }

  hoverPreviewUrl(file: FileRef): string {
    return `https://storage.test/${file.resourceType}/${file.publicId}.preview.mp4`;
  }

  thumbnailUrl(file: FileRef): string {
    return `https://storage.test/${file.resourceType}/${file.publicId}.jpg`;
  }
}
