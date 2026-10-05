import type { ResourceType } from '../../db/models/Meme.js';

export interface UploadInput {
  buffer: Buffer;
  resourceType: ResourceType;
  allowedFormats: readonly string[];
  /** `public` entrega logo pela CDN; `private` só por URL assinado (pendentes). */
  visibility: 'public' | 'private';
}

export interface StoredFile {
  publicId: string;
  format: string;
  bytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

export interface FileRef {
  publicId: string;
  resourceType: ResourceType;
  format: string;
}

export interface StorageService {
  upload(input: UploadInput): Promise<StoredFile>;
  destroy(file: FileRef & { visibility: 'public' | 'private' }): Promise<void>;
  fileUrl(file: FileRef): string;
  thumbnailUrl(file: FileRef & { durationMs: number | null }): string;
}

/** O fornecedor recusou o ficheiro (formato, corrompido, etc.). */
export class StorageRejectedError extends Error {}
