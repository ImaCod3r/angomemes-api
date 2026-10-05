import { fileTypeFromBuffer } from 'file-type';
import { MEME_TYPES, type MemeType, type ResourceType } from '../../db/models/Meme.js';

const MB = 1024 * 1024;

interface MemeTypeRule {
  label: string;
  resourceType: ResourceType;
  /** Extensões que o `file-type` deteta a partir do conteúdo. */
  detectedExts: readonly string[];
  /** Reforço do lado do Cloudinary (`allowed_formats`). */
  cloudinaryFormats: readonly string[];
  maxBytes: number;
}

export const MEME_TYPE_RULES: Record<MemeType, MemeTypeRule> = {
  video: {
    label: 'vídeo',
    resourceType: 'video',
    detectedExts: ['mp4', 'webm'],
    cloudinaryFormats: ['mp4', 'webm'],
    maxBytes: 50 * MB,
  },
  gif: {
    label: 'GIF',
    resourceType: 'image',
    detectedExts: ['gif'],
    cloudinaryFormats: ['gif'],
    maxBytes: 10 * MB,
  },
  audio: {
    label: 'áudio',
    resourceType: 'video',
    // `opus` é Ogg com Opus, o formato das notas de voz do WhatsApp.
    detectedExts: ['mp3', 'ogg', 'opus', 'wav'],
    cloudinaryFormats: ['mp3', 'ogg', 'opus', 'wav'],
    maxBytes: 5 * MB,
  },
};

export const MAX_UPLOAD_BYTES = Math.max(...Object.values(MEME_TYPE_RULES).map((r) => r.maxBytes));

export function isMemeType(value: unknown): value is MemeType {
  return typeof value === 'string' && (MEME_TYPES as readonly string[]).includes(value);
}

/** Formato detetado pelo conteúdo (bytes iniciais), ou null se não for aceite para o tipo. */
export async function detectFormat(type: MemeType, buffer: Buffer): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer);
  return detected && MEME_TYPE_RULES[type].detectedExts.includes(detected.ext) ? detected.ext : null;
}

export function acceptedFormatsMessage(type: MemeType): string {
  const rule = MEME_TYPE_RULES[type];
  return `Formato não aceite para ${rule.label}. Formatos aceites: ${rule.cloudinaryFormats
    .filter((f) => f !== 'opus')
    .join(', ')}.`;
}

export function tooLargeMessage(type: MemeType): string {
  const rule = MEME_TYPE_RULES[type];
  return `O ficheiro passa o limite de ${rule.maxBytes / MB} MB para ${rule.label}.`;
}
