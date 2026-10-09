import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { ResourceType } from '../../db/models/Meme.js';
import {
  StorageRejectedError,
  type DirectUploadInput,
  type FileRef,
  type SignedUpload,
  type StorageService,
  type StoredFile,
  type UploadInput,
  type Visibility,
} from './StorageService.js';

const THUMB_WIDTH = 480;
/**
 * Marca d'água das descargas: "angomemes" a branco, semitransparente e com contorno
 * escuro (lê-se em fundos claros e escuros), no canto inferior direito.
 * Tamanho relativo: ~18% da largura do meme, a 3% das margens.
 * Aplicada pelo Cloudinary no URL: o original fica intacto e nada é guardado à parte.
 */
const WATERMARK_LAYER = [
  {
    overlay: { font_family: 'Arial', font_size: 64, font_weight: 'bold', stroke: 'stroke', text: 'angomemes' },
    color: '#FFFFFF',
    border: '4px_solid_rgb:00000099',
    opacity: 70,
    width: 0.18,
    flags: 'relative',
  },
  { flags: 'layer_apply', gravity: 'south_east', x: 0.03, y: 0.03 },
];

/** Segundos do excerto de pré-visualização dos vídeos. */
const HOVER_PREVIEW_SECONDS = 4;
const PRIVATE_URL_TTL_SECONDS = 60 * 60;

const deliveryType = (visibility: Visibility) => (visibility === 'public' ? 'upload' : 'authenticated');

/**
 * Todos os URLs públicos vão assinados. Com "Strict transformations" ligado na consola
 * do Cloudinary, só as transformações geradas aqui são aceites: ninguém gasta créditos
 * com variantes inventadas a partir de um public_id.
 */
const SIGNED = { sign_url: true, secure: true } as const;

/** Formato (WebP/AVIF quando o browser aceita) e compressão escolhidos pelo Cloudinary. */
const AUTO_FORMAT = { fetch_format: 'auto', quality: 'auto' } as const;
/**
 * Pré-visualização dos links: 1200×630 (o tamanho que o Facebook, o WhatsApp e o X pedem),
 * com o meme inteiro sobre um fundo desfocado dele próprio: um vídeo vertical do TikTok
 * aparece inteiro, sem cortes nem barras pretas. JPG sem `f_auto`: os robôs das redes nem
 * sempre aceitam WebP.
 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Largura máxima da imagem mostrada na página do meme; o original fica para a descarga. */
const DISPLAY_WIDTH = 1280;

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

  signUpload(input: DirectUploadInput): SignedUpload {
    const { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret } = cloudinary.config();
    // Tudo o que vai aqui fica coberto pela assinatura: o browser não pode mudar o public_id,
    // a entrega (pendentes ficam privados), os formatos, nem substituir um ficheiro que já
    // existe (overwrite=false; a assinatura vale 1 hora e não pode servir para trocar um meme aprovado).
    const publicId = `${this.folder}/${input.name}`;
    const params = {
      public_id: publicId,
      type: deliveryType(input.visibility),
      allowed_formats: input.allowedFormats.join(','),
      overwrite: 'false',
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const signature = cloudinary.utils.api_sign_request(params, apiSecret!);
    return {
      url: `https://api.cloudinary.com/v1_1/${cloudName}/${input.resourceType}/upload`,
      fields: { ...params, api_key: apiKey!, signature },
      publicId,
    };
  }

  async getUploaded(file: { publicId: string; resourceType: ResourceType; visibility: Visibility }): Promise<StoredFile | null> {
    let result: { public_id: string; format: string; bytes?: number; width?: number; height?: number; duration?: number };
    try {
      result = await cloudinary.api.resource(file.publicId, {
        resource_type: file.resourceType,
        type: deliveryType(file.visibility),
      });
    } catch (err) {
      if ((err as { error?: { http_code?: number } }).error?.http_code === 404) return null;
      throw err;
    }
    return {
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes ?? null,
      durationMs: typeof result.duration === 'number' ? Math.round(result.duration * 1000) : null,
      width: result.width ?? null,
      height: result.height ?? null,
    };
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
      ...SIGNED,
      resource_type: file.resourceType,
      type: 'upload',
      format: file.format,
    });
  }

  displayUrl(file: FileRef): string {
    if (file.resourceType !== 'image') return this.fileUrl(file);
    return cloudinary.url(file.publicId, {
      ...SIGNED,
      resource_type: 'image',
      type: 'upload',
      format: file.format,
      transformation: [{ width: DISPLAY_WIDTH, crop: 'limit', ...AUTO_FORMAT }],
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

  downloadUrl(file: FileRef, filename: string, options: { watermark?: boolean } = {}): string {
    return cloudinary.url(file.publicId, {
      ...SIGNED,
      resource_type: file.resourceType,
      type: 'upload',
      format: file.format,
      transformation: [...(options.watermark ? WATERMARK_LAYER : []), { flags: `attachment:${filename}` }],
    });
  }

  hoverPreviewUrl(file: FileRef): string {
    // Gerado pelo Cloudinary no primeiro pedido e depois servido pela CDN; nada é guardado à parte.
    return cloudinary.url(file.publicId, {
      ...SIGNED,
      resource_type: 'video',
      format: 'mp4',
      transformation: [
        {
          start_offset: 0,
          duration: HOVER_PREVIEW_SECONDS,
          width: THUMB_WIDTH,
          crop: 'scale',
          audio_codec: 'none',
          quality: 'auto:low',
        },
      ],
    });
  }

  ogImageUrl(file: FileRef & { durationMs: number | null }): string {
    if (file.resourceType === 'image') {
      // Nas imagens o fundo desfocado faz-se com camadas: a própria imagem a encher e
      // desfocada, e por cima a imagem inteira.
      return cloudinary.url(file.publicId, {
        ...SIGNED,
        resource_type: 'image',
        format: 'jpg',
        transformation: [
          { width: OG_WIDTH, height: OG_HEIGHT, crop: 'fill', effect: 'blur:2000' },
          { effect: 'brightness:-15' },
          // Nas camadas o public_id leva ":" em vez de "/".
          { overlay: file.publicId.replaceAll('/', ':'), width: OG_WIDTH, height: OG_HEIGHT, crop: 'fit' },
          { flags: 'layer_apply' },
          { quality: 'auto:good' },
        ],
      });
    }
    // Num fotograma de vídeo não há camadas da própria imagem: o fundo é a cor das margens.
    const startOffset = file.durationMs !== null && file.durationMs > 1000 ? 1 : 0;
    return cloudinary.url(file.publicId, {
      ...SIGNED,
      resource_type: 'video',
      format: 'jpg',
      transformation: [
        { start_offset: startOffset, width: OG_WIDTH, height: OG_HEIGHT, crop: 'pad', background: 'auto' },
        { quality: 'auto:good' },
      ],
    });
  }

  thumbnailUrl(file: FileRef & { durationMs: number | null }): string {
    if (file.resourceType === 'image') {
      // Imagem: a própria imagem reduzida; a original só carrega ao abrir o meme.
      return cloudinary.url(file.publicId, {
        ...SIGNED,
        resource_type: 'image',
        format: 'jpg',
        transformation: [{ width: THUMB_WIDTH, crop: 'limit', ...AUTO_FORMAT }],
      });
    }
    // Vídeo: fotograma por volta do 1.º segundo (ou o primeiro, se for mais curto).
    const startOffset = file.durationMs !== null && file.durationMs > 1000 ? 1 : 0;
    return cloudinary.url(file.publicId, {
      ...SIGNED,
      resource_type: 'video',
      format: 'jpg',
      transformation: [{ start_offset: startOffset, width: THUMB_WIDTH, crop: 'scale', ...AUTO_FORMAT }],
    });
  }
}
