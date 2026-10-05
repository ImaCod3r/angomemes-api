/** Minúsculas, sem acentos, só letras, números e hífenes: "Kuduro Ñice!" → "kuduro-nice". */
export function slugify(raw: string, maxLength: number): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

/** Deixa espaço para o sufixo "-N" sem passar o tamanho da coluna (90). */
export const MEME_SLUG_BASE_MAX = 80;
export const MEME_SLUG_MAX = 90;
export const MEME_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Base do slug de um meme; títulos sem letras nem números dão "meme". */
export function memeSlugBase(title: string): string {
  return slugify(title, MEME_SLUG_BASE_MAX) || 'meme';
}

/**
 * Primeiro slug livre: a base, ou a base com "-2", "-3"…
 * `taken` são os slugs já usados que começam pela base.
 */
export function pickFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
