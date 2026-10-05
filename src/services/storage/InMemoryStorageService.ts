import { randomUUID } from 'node:crypto';
import type { FileRef, StorageService, StoredFile, UploadInput } from './StorageService.js';

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

  fileUrl(file: FileRef): string {
    return `https://storage.test/${file.resourceType}/${file.publicId}.${file.format}`;
  }

  thumbnailUrl(file: FileRef): string {
    return `https://storage.test/${file.resourceType}/${file.publicId}.jpg`;
  }
}
