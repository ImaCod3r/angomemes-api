import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import {
  StorageRejectedError,
  type FileRef,
  type StorageService,
  type StoredFile,
  type UploadInput,
  type Visibility,
} from './StorageService.js';

const THUMB_WIDTH = 480;
const PRIVATE_URL_TTL_SECONDS = 60 * 60;

const deliveryType = (visibility: Visibility) => (visibility === 'public' ? 'upload' : 'authenticated');

/** Lê as credenciais de CLOUDINARY_URL (o SDK trata disso sozinho). */
export class CloudinaryStorageService implements StorageService {
  private readonly folder: string;

  constructor(folder: string) {
    this.folder = folder;
    cloudinary.config({ secure: true });
  }

  upload(input: UploadInput): Promise<StoredFile> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: input.resourceType,
          type: input.visibility === 'public' ? 'upload' : 'authenticated',
          folder: this.folder,
          allowed_formats: [...input.allowedFormats],
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            // 4xx do Cloudinary: o ficheiro foi recusado. O resto é falha do serviço.
            if (error && error.http_code >= 400 && error.http_code < 500) {
              reject(new StorageRejectedError(error.message));
            } else {
              reject(error ?? new Error('Upload para o Cloudinary sem resposta.'));
            }
            return;
          }
          resolve({
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes ?? null,
            durationMs: typeof result.duration === 'number' ? Math.round(result.duration * 1000) : null,
            width: result.width ?? null,
            height: result.height ?? null,
          });
        },
      );
      stream.end(input.buffer);
    });
  }

  async destroy(file: FileRef & { visibility: 'public' | 'private' }): Promise<void> {
    await cloudinary.uploader.destroy(file.publicId, {
      resource_type: file.resourceType,
      type: file.visibility === 'public' ? 'upload' : 'authenticated',
      invalidate: true,
    });
  }

  fileUrl(file: FileRef): string {
    return cloudinary.url(file.publicId, {
      resource_type: file.resourceType,
      type: 'upload',
      format: file.format,
    });
  }

  async setVisibility(file: FileRef, from: Visibility, to: Visibility): Promise<void> {
    if (from === to) return;
    // Mesmo public_id, outro tipo de entrega: o ficheiro não volta a ser enviado.
    await cloudinary.uploader.rename(file.publicId, file.publicId, {
      resource_type: file.resourceType,
      type: deliveryType(from),
      to_type: deliveryType(to),
      invalidate: true,
    });
  }

  privateUrl(file: FileRef): string {
    // URL de descarga privada da API, que expira; não depende do plano ter token auth.
    return cloudinary.utils.private_download_url(file.publicId, file.format, {
      resource_type: file.resourceType,
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + PRIVATE_URL_TTL_SECONDS,
    });
  }

  downloadUrl(file: FileRef, filename: string): string {
    return cloudinary.url(file.publicId, {
      resource_type: file.resourceType,
      type: 'upload',
      format: file.format,
      flags: `attachment:${filename}`,
    });
  }

  thumbnailUrl(file: FileRef & { durationMs: number | null }): string {
    if (file.resourceType === 'image') {
      // Imagem: a própria imagem reduzida; a original só carrega ao abrir o meme.
      return cloudinary.url(file.publicId, {
        resource_type: 'image',
        format: 'jpg',
        transformation: [{ width: THUMB_WIDTH, crop: 'limit' }],
      });
    }
    // Vídeo: fotograma por volta do 1.º segundo (ou o primeiro, se for mais curto).
    const startOffset = file.durationMs !== null && file.durationMs > 1000 ? 1 : 0;
    return cloudinary.url(file.publicId, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [{ start_offset: startOffset, width: THUMB_WIDTH, crop: 'scale' }],
    });
  }
}
