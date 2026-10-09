import { literal } from 'sequelize';
import { sequelize } from '../../db/index.js';
import { escapeLike } from '../../db/like.js';

/** Palavras a mais numa pesquisa só a tornam lenta; as primeiras chegam. */
const MAX_TERMS = 6;
/** Abaixo disto os trigramas não servem: a palavra só conta se aparecer tal e qual. */
const FUZZY_MIN_LENGTH = 3;
/**
 * Semelhança mínima (0 a 1) para uma palavra contar como a mesma com erros de escrita.
 * O `<%` usa o limite do pg_trgm (0,6), que deixa de fora "kudoro" → "kuduro"; um SET por
 * ligação não serve atrás de um pooler, por isso o limite vai na própria condição.
 */
export const FUZZY_THRESHOLD = 0.45;

/** Palavras que não dizem nada sobre o meme ("o meme do kuduro" → "meme", "kuduro"). */
const STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas',
  'no', 'nos', 'o', 'os', 'ou', 'para', 'pra', 'por', 'que', 'se', 'um', 'uma', 'uns', 'umas',
]);

/** Minúsculas, sem acentos e só letras e números: igual ao `search_normalize` da base. */
export function normalizeSearch(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface SearchTerms {
  /** A pesquisa inteira normalizada, para a semelhança com o título. */
  phrase: string;
  /** As palavras que contam, sem repetidas. Só palavras vazias? Ficam essas. */
  words: string[];
}

/** null se a pesquisa não tiver nenhuma letra ou número. */
export function searchTerms(q: string): SearchTerms | null {
  const phrase = normalizeSearch(q);
  if (!phrase) return null;
  const all = [...new Set(phrase.split(' '))];
  const meaningful = all.filter((word) => !STOPWORDS.has(word));
  return { phrase, words: (meaningful.length > 0 ? meaningful : all).slice(0, MAX_TERMS) };
}

const TITLE = 'search_normalize("Meme"."title")';

/**
 * A palavra aparece no título ou numa tag do meme: tal e qual (parte de uma palavra também
 * conta, "kudu" → "kuduro") ou parecida, para erros de escrita ("kudoro" → "kuduro").
 * As tags comparam-se pelo slug, que já está sem acentos e em minúsculas.
 */
function wordMatchSql(word: string): string {
  const like = sequelize.escape(`%${escapeLike(word)}%`);
  const fuzzy = word.length >= FUZZY_MIN_LENGTH;
  const value = sequelize.escape(word);
  const similar = (column: string) => (fuzzy ? ` OR word_similarity(${value}, ${column}) >= ${FUZZY_THRESHOLD}` : '');
  const inTitle = `${TITLE} LIKE ${like}${similar(TITLE)}`;
  const inTags = `t.slug LIKE ${like}${similar('t.slug')}`;
  return `(${inTitle} OR EXISTS (SELECT 1 FROM meme_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.meme_id = "Meme"."id" AND (${inTags})))`;
}

/**
 * Filtro da pesquisa. `every`: todas as palavras têm de aparecer (quando a ordem é outra,
 * por exemplo os populares). `some`: basta uma, e a relevância põe os melhores primeiro.
 */
export function searchWhere(terms: SearchTerms, mode: 'every' | 'some') {
  return literal(`(${terms.words.map(wordMatchSql).join(mode === 'every' ? ' AND ' : ' OR ')})`);
}

/** Quantas palavras aparecem, mais a semelhança da pesquisa inteira com o título (0 a 1). */
export function relevanceSql(terms: SearchTerms) {
  const matched = terms.words.map((word) => `(CASE WHEN ${wordMatchSql(word)} THEN 1 ELSE 0 END)`).join(' + ');
  return literal(`(${matched} + word_similarity(${sequelize.escape(terms.phrase)}, ${TITLE}))`);
}
