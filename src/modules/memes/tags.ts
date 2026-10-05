export const MAX_TAGS_PER_MEME = 8;
export const TAG_MAX_LENGTH = 40;

/** Minúsculas, sem acentos, só letras, números e hífenes: "Kuduro Ñice!" → "kuduro-nice". */
export function slugifyTag(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/** Normaliza e remove repetidas (pelo slug). Tags sem nenhuma letra ou número são ignoradas. */
export function normalizeTags(raw: string[]): { slug: string; name: string }[] {
  const bySlug = new Map<string, string>();
  for (const value of raw) {
    const slug = slugifyTag(value);
    if (slug && !bySlug.has(slug)) {
      bySlug.set(slug, value.trim().replace(/\s+/g, ' ').slice(0, TAG_MAX_LENGTH));
    }
  }
  return [...bySlug].map(([slug, name]) => ({ slug, name }));
}
