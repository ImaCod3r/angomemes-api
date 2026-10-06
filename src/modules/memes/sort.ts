import { literal, type Order } from 'sequelize';

export const MEME_SORTS = ['recent', 'popular', 'random'] as const;
export type MemeSort = (typeof MEME_SORTS)[number];

/** Limite da semente da ordem aleatória (inteiro positivo, vai direto para o SQL). */
export const RANDOM_SEED_MAX = 2_147_483_647;

/**
 * Ordem da listagem pública. Termina sempre no id para a paginação ser estável.
 * A ordem aleatória usa uma semente: a mesma semente dá a mesma ordem, por isso
 * "Carregar mais" não repete nem salta memes.
 */
export function orderFor(sort: MemeSort, seed: number): Order {
  switch (sort) {
    case 'popular':
      return [
        ['downloadsCount', 'DESC'],
        ['publishedAt', 'DESC'],
        ['id', 'DESC'],
      ];
    case 'random':
      // `seed` é um inteiro validado pelo zod; nunca texto do utilizador.
      return [[literal(`md5("Meme"."id"::text || '${Math.trunc(seed)}')`), 'ASC'], ['id', 'ASC']];
    case 'recent':
      return [
        ['publishedAt', 'DESC'],
        ['id', 'DESC'],
      ];
  }
}
