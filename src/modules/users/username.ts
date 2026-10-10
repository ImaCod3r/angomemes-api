import { slugify } from '../memes/slug.js';

/** Deixa espaço para o sufixo "-N" sem passar o tamanho da coluna (40). */
export const USERNAME_BASE_MAX = 30;
export const USERNAME_MAX = 40;
export const USERNAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Base do nome de utilizador a partir do nome; nomes sem letras nem números dão "utilizador". */
export function usernameBase(name: string): string {
  return slugify(name, USERNAME_BASE_MAX) || 'utilizador';
}
