/**
 * Algoritmo do feed vertical ("Para ti"), só com vídeos publicados.
 *
 * Cada vídeo recebe uma pontuação, e o feed é essa pontuação por ordem decrescente:
 *
 *   pontuação = qualidade × frescura × descoberta × afinidade × visto × sorte
 *
 * - qualidade: ln(2 + 3·likes + descargas). Um like vale mais do que uma descarga, e o
 *   logaritmo impede que meia dúzia de virais ocupem o feed todo.
 * - frescura: 1 / √(1 + idade em dias / 30). Os recentes sobem, mas um clássico com
 *   muitos likes continua a aparecer (a queda é lenta, não exponencial).
 * - descoberta: 1 + 1,5·e^(−dias/3). Um vídeo acabado de sair ainda não tem likes; nos
 *   primeiros dias vale até 2,5× para chegar às primeiras pessoas e poder ganhá-los.
 * - afinidade (só com sessão): as tags dos memes a que a conta deu like formam um perfil;
 *   cada vídeo ganha até +120% conforme as tags que partilha com esse perfil.
 * - visto: os que a conta já marcou com like valem 30%, para dar lugar a coisas novas.
 * - sorte: um fator entre 0,6 e 1,4 tirado da semente da sessão. A mesma semente dá a
 *   mesma ordem (a paginação não repete), uma semente nova dá um feed diferente.
 *
 * Depois, em cada página, `spreadByUploader` evita dois vídeos seguidos da mesma conta.
 */

/** Peso máximo da afinidade (perfil de tags normalizado a 1 na tag preferida). */
const AFFINITY_CAP = 2;
const AFFINITY_WEIGHT = 0.6;
/** Aos 30 dias a frescura vale ~70%; aos 90, metade. */
const FRESHNESS_DAYS = 30;
/** Impulso dos vídeos novos: +150% ao sair, ~+50% ao fim de 3 dias, quase nada depois de uma semana. */
const DISCOVERY_BOOST = 1.5;
const DISCOVERY_DAYS = 3;
/** Peso de um vídeo a que a conta já deu like. */
const ALREADY_LIKED = 0.3;

/**
 * IDs dos vídeos pela ordem do feed. `:userId` pode ser null (sem sessão: sem afinidade
 * nem penalização), `:exclude` também (o vídeo por onde o feed começou).
 */
export const FOR_YOU_SQL = `
WITH prefs AS (
  SELECT mt.tag_id, COUNT(*)::float8 AS w
    FROM likes l
    JOIN meme_tags mt ON mt.meme_id = l.meme_id
   WHERE l.user_id = :userId
   GROUP BY mt.tag_id
),
norm AS (SELECT GREATEST(MAX(w), 1) AS top FROM prefs)
SELECT m.id
  FROM memes m
  CROSS JOIN LATERAL (
    SELECT GREATEST(EXTRACT(EPOCH FROM now() - m.published_at), 0) / 86400 AS days
  ) age
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.w), 0) / (SELECT top FROM norm) AS affinity
      FROM meme_tags mt
      JOIN prefs p ON p.tag_id = mt.tag_id
     WHERE mt.meme_id = m.id
  ) a ON TRUE
 WHERE m.status = 'published'
   AND m.type = 'video'
   AND (CAST(:exclude AS uuid) IS NULL OR m.id <> CAST(:exclude AS uuid))
 ORDER BY
   ln(2 + 3 * m.likes_count + m.downloads_count)
   / sqrt(1 + age.days / ${FRESHNESS_DAYS})
   * (1 + ${DISCOVERY_BOOST} * exp(-age.days / ${DISCOVERY_DAYS}))
   * (1 + LEAST(a.affinity, ${AFFINITY_CAP}) * ${AFFINITY_WEIGHT})
   * CASE WHEN EXISTS (SELECT 1 FROM likes lk WHERE lk.user_id = :userId AND lk.meme_id = m.id)
          THEN ${ALREADY_LIKED} ELSE 1 END
   * (0.6 + 0.8 * ((('x' || substr(md5(m.id::text || :seed), 1, 8))::bit(32)::int::float8 + 2147483648) / 4294967295))
   DESC,
   m.id
 LIMIT :limit OFFSET :offset
`;

/**
 * Reordena uma página para não haver dois seguidos da mesma conta, mexendo o mínimo:
 * quando o próximo é da mesma conta que o anterior, troca-o pelo primeiro a seguir que
 * não seja. Se só sobrarem da mesma conta, ficam como estão.
 */
export function spreadByUploader<T extends { uploadedBy: string }>(items: readonly T[]): T[] {
  const rest = [...items];
  const result: T[] = [];
  while (rest.length > 0) {
    const previous = result.at(-1)?.uploadedBy;
    const index = rest.findIndex((item) => item.uploadedBy !== previous);
    result.push(...rest.splice(index === -1 ? 0 : index, 1));
  }
  return result;
}
