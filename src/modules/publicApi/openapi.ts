/**
 * Especificação OpenAPI da API pública v1, escrita à mão (o dev.md prevê esta
 * alternativa ao zod-to-openapi). O teste de contrato confirma que o DTO e o
 * schema `Meme` têm exatamente os mesmos campos.
 */
import { MAX_PAGE } from '../memes/memes.service.js';
import { MAX_ACTIVE_KEYS_PER_USER } from './apiKeys.js';

export const PUBLIC_API_RATE_LIMIT_PER_MINUTE = 60;
export const PUBLIC_API_MAX_PAGE_SIZE = 50;

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const commonErrors = {
  401: errorResponse('Chave em falta, inválida ou revogada.'),
  429: {
    ...errorResponse('Limite de pedidos ultrapassado. Espera os segundos indicados em `Retry-After`.'),
    headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Segundos até poder tentar outra vez.' } },
  },
};

const typeParam = {
  name: 'type',
  in: 'query',
  schema: { type: 'string', enum: ['video', 'image', 'audio'] },
  description: 'Só memes deste tipo.',
};
const tagParam = {
  name: 'tag',
  in: 'query',
  schema: { type: 'string' },
  description: 'Slug da tag (ver `GET /tags`).',
  example: 'kuduro',
};

export function buildOpenApiSpec(serverUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Angomemes API',
      version: '1.0.0',
      description: [
        'API pública, gratuita e só de leitura do acervo de memes angolanos.',
        '',
        `**Autenticação:** cria uma chave na página /api do site (máximo ${MAX_ACTIVE_KEYS_PER_USER} por conta) e envia-a em \`Authorization: Bearer <chave>\`.`,
        '',
        `**Limites:** ${PUBLIC_API_RATE_LIMIT_PER_MINUTE} pedidos por minuto por chave. As respostas trazem os cabeçalhos \`RateLimit\` e \`RateLimit-Policy\`; acima do limite a resposta é 429 com \`Retry-After\`.`,
        '',
        '**Crédito:** ao mostrar um meme, liga para o `pageUrl` dele.',
        '',
        '**Estabilidade:** nada que quebre clientes entra na v1; campos novos podem ser acrescentados.',
      ].join('\n'),
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    paths: {
      '/memes': {
        get: {
          summary: 'Pesquisar e listar memes',
          operationId: 'listMemes',
          parameters: [
            typeParam,
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 }, description: 'Pesquisa no título e nas tags, sem ligar a acentos e com tolerância a erros de escrita.' },
            tagParam,
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string', enum: ['recent', 'popular', 'random', 'relevance'], default: 'recent' },
              description:
                '`popular` = mais likes (desempate: descargas). `random` usa `seed`. `relevance` (com `q`) põe primeiro os que correspondem melhor e aceita memes que tenham só parte das palavras.',
            },
            {
              name: 'seed',
              in: 'query',
              schema: { type: 'integer', minimum: 0 },
              description: 'Com `sort=random`: a mesma semente dá a mesma ordem, para paginar sem repetir.',
            },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: PUBLIC_API_MAX_PAGE_SIZE, default: 24 },
              description: `Acima de ${PUBLIC_API_MAX_PAGE_SIZE} é cortado para ${PUBLIC_API_MAX_PAGE_SIZE}.`,
            },
          ],
          responses: {
            200: {
              description: 'Uma página de memes.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/MemePage' } } },
            },
            400: errorResponse('Parâmetros inválidos.'),
            ...commonErrors,
          },
        },
      },
      '/memes/random': {
        get: {
          summary: 'Um meme ao acaso',
          description: 'Útil para bots. 404 se não houver nenhum meme com os filtros pedidos.',
          operationId: 'randomMeme',
          parameters: [typeParam, tagParam],
          responses: {
            200: {
              description: 'Um meme.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/MemeResponse' } } },
            },
            404: errorResponse('Nenhum meme com estes filtros.'),
            ...commonErrors,
          },
        },
      },
      '/memes/{idOrSlug}': {
        get: {
          summary: 'Detalhe de um meme',
          operationId: 'getMeme',
          parameters: [
            {
              name: 'idOrSlug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'O `id` (UUID) ou o `slug` do meme.',
              example: 'ya-mano',
            },
          ],
          responses: {
            200: {
              description: 'O meme.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/MemeResponse' } } },
            },
            404: errorResponse('Não existe ou não está publicado.'),
            ...commonErrors,
          },
        },
      },
      '/tags': {
        get: {
          summary: 'Tags disponíveis',
          description: 'Tags com pelo menos 1 meme publicado, as mais usadas primeiro.',
          operationId: 'listTags',
          responses: {
            200: {
              description: 'As tags.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['items'],
                    properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Tag' } } },
                  },
                },
              },
            },
            ...commonErrors,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Chave criada em /api (começa por `am_`).' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: { code: { type: 'string', example: 'INVALID_API_KEY' }, message: { type: 'string' } },
            },
          },
        },
        TagRef: {
          type: 'object',
          required: ['slug', 'name'],
          properties: { slug: { type: 'string', example: 'kuduro' }, name: { type: 'string', example: 'Kuduro' } },
        },
        Tag: {
          type: 'object',
          required: ['slug', 'name', 'memesCount'],
          properties: {
            slug: { type: 'string', example: 'kuduro' },
            name: { type: 'string', example: 'Kuduro' },
            memesCount: { type: 'integer', example: 12 },
          },
        },
        Meme: {
          type: 'object',
          required: [
            'id',
            'slug',
            'type',
            'title',
            'tags',
            'fileUrl',
            'thumbUrl',
            'previewUrl',
            'downloadUrl',
            'durationMs',
            'width',
            'height',
            'downloadsCount',
            'likesCount',
            'pageUrl',
            'publishedAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            slug: { type: 'string', example: 'ya-mano' },
            type: { type: 'string', enum: ['video', 'image', 'audio'] },
            title: { type: 'string', example: 'Ya mano' },
            tags: { type: 'array', items: { $ref: '#/components/schemas/TagRef' } },
            fileUrl: { type: 'string', format: 'uri', description: 'O ficheiro original (CDN).' },
            thumbUrl: {
              type: ['string', 'null'],
              format: 'uri',
              description: 'Miniatura (480 px). `null` nos áudios.',
            },
            previewUrl: {
              type: ['string', 'null'],
              format: 'uri',
              description: 'Só vídeos: excerto curto, sem som, para pré-visualizar.',
            },
            downloadUrl: {
              type: 'string',
              format: 'uri',
              description:
                'O ficheiro com cabeçalho de descarga (o navegador guarda em vez de abrir). Vídeos e imagens levam a marca d\'água do Angomemes num canto.',
            },
            durationMs: { type: ['integer', 'null'], description: 'Vídeos e áudios.' },
            width: { type: ['integer', 'null'] },
            height: { type: ['integer', 'null'] },
            downloadsCount: { type: 'integer', description: 'Descargas feitas no site.' },
            likesCount: { type: 'integer', description: 'Contas que deram like no site.' },
            pageUrl: { type: 'string', format: 'uri', description: 'Página do meme no Angomemes (usa para dar crédito).' },
            publishedAt: { type: 'string', format: 'date-time' },
          },
        },
        MemeResponse: {
          type: 'object',
          required: ['meme'],
          properties: { meme: { $ref: '#/components/schemas/Meme' } },
        },
        MemePage: {
          type: 'object',
          required: ['items', 'page', 'limit', 'total', 'hasMore'],
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/Meme' } },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  };
}
