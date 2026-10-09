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

export type Visibility = 'public' | 'private';

export interface DirectUploadInput {
  /** Nome único escolhido pelo backend (um UUID); o storage junta-lhe a pasta. */
  name: string;
  resourceType: ResourceType;
  allowedFormats: readonly string[];
  visibility: Visibility;
}

/** Para o browser enviar o ficheiro: POST multipart para `url`, com `fields` e o campo `file`. */
export interface SignedUpload {
  url: string;
  fields: Record<string, string>;
  /** O public_id completo; o browser não o pode mudar sem partir a assinatura. */
  publicId: string;
}

export interface StorageService {
  upload(input: UploadInput): Promise<StoredFile>;
  /** Autoriza um envio direto do browser, só para este public_id, sem substituir nada. */
  signUpload(input: DirectUploadInput): SignedUpload;
  /** O que chegou de um envio direto (dados do próprio fornecedor), ou null se ainda não chegou. */
  getUploaded(file: { publicId: string; resourceType: ResourceType; visibility: Visibility }): Promise<StoredFile | null>;
  destroy(file: FileRef & { visibility: 'public' | 'private' }): Promise<void>;
  fileUrl(file: FileRef): string;
  /** Imagens: versão reduzida e comprimida para mostrar na página; outros tipos: o próprio ficheiro. */
  displayUrl(file: FileRef): string;
  /**
   * URL que obriga o browser a descarregar, com o nome de ficheiro indicado (sem extensão).
   * Com `watermark`, o ficheiro descarregado leva a marca d'água do Angomemes (vídeos e imagens).
   */
  downloadUrl(file: FileRef, filename: string, options?: { watermark?: boolean }): string;
  thumbnailUrl(file: FileRef & { durationMs: number | null }): string;
  /**
   * Imagem de pré-visualização para links partilhados (WhatsApp, Facebook, Google): 1200×630,
   * JPG, com o meme inteiro sobre um fundo desfocado. Só vídeos e imagens.
   */
  ogImageUrl(file: FileRef & { durationMs: number | null }): string;
  /** Só vídeos: excerto curto, pequeno e sem som, para pré-visualizar na listagem como um GIF. */
  hoverPreviewUrl(file: FileRef): string;
  /** Passa o ficheiro entre público (CDN) e privado, sem o reenviar, e limpa a cache da CDN. */
  setVisibility(file: FileRef, from: Visibility, to: Visibility): Promise<void>;
  /** URL temporário para ver um ficheiro privado; só se entrega a administradores. */
  privateUrl(file: FileRef): string;
}

/** O fornecedor recusou o ficheiro (formato, corrompido, etc.). */
export class StorageRejectedError extends Error {}
