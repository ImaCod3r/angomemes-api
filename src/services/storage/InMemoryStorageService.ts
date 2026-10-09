import { randomUUID } from 'node:crypto';
import type {
  DirectUploadInput,
  FileRef,
  SignedUpload,
  StorageService,
  StoredFile,
  UploadInput,
  Visibility,
} from './StorageService.js';

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

  /** Envios diretos autorizados; os testes simulam a chegada com `simulateDirectUpload`. */
  readonly signedUploads: DirectUploadInput[] = [];

  signUpload(input: DirectUploadInput): SignedUpload {
    this.signedUploads.push(input);
    const publicId = `test/${input.name}`;
    return { url: `https://storage.test/upload/${input.resourceType}`, fields: { public_id: publicId }, publicId };
  }

  simulateDirectUpload(publicId: string, input: Omit<UploadInput, 'allowedFormats'> & { format: string }) {
    this.files.set(publicId, { ...input, allowedFormats: [input.format] });
  }

  async getUploaded(file: { publicId: string }): Promise<StoredFile | null> {
    const stored = this.files.get(file.publicId);
    if (!stored) return null;
    return {
      publicId: file.publicId,
      format: stored.allowedFormats[0]!,
      bytes: stored.buffer.length,
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

  displayUrl(file: FileRef): string {
    return file.resourceType === 'image' ? `${this.fileUrl(file)}?display=1` : this.fileUrl(file);
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
