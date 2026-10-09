/** Escapa `\`, `%` e `_` para o texto ser procurado tal e qual num LIKE/ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
