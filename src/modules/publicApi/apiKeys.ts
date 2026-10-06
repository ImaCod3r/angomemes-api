import { createHash, randomBytes } from 'node:crypto';

/** Prefixo reconhecível: quem encontrar uma chave num repositório sabe logo de onde é. */
export const API_KEY_PREFIX = 'am_';
const SECRET_BYTES = 24; // 24 bytes → 32 caracteres base64url
const KEY_PATTERN = /^am_[A-Za-z0-9_-]{32}$/;
/** Quanto da chave se guarda e mostra para a reconhecer na lista. */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export const MAX_ACTIVE_KEYS_PER_USER = 5;

export interface GeneratedApiKey {
  /** A chave completa: só se mostra uma vez, ao criar. */
  key: string;
  prefix: string;
  hash: string;
}

/**
 * SHA-256 chega: a chave é aleatória com 192 bits, não é uma palavra-passe,
 * por isso não há dicionário para atacar e não é preciso um hash lento.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), hash: hashApiKey(key) };
}

/** Formato válido? Chaves mal formadas recusam-se sem ir à base. */
export function isWellFormedApiKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/** Lê "Authorization: Bearer <chave>"; null se faltar ou tiver outro esquema. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1]! : null;
}
