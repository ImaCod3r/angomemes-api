# Angomemes API

Backend do Angomemes, o acervo de memes angolanos: vídeos, imagens e áudios para encontrar, reproduzir, descarregar e partilhar.

Serve o site (API interna, com sessão por cookie), o painel de administração e uma API pública só de leitura para bots e apps.

**Stack:** Node.js 22 · Express 5 · TypeScript · PostgreSQL (Sequelize + migrações com Umzug) · Cloudinary (ficheiros e CDN) · login com Google · Vitest.

---

## Índice

- [O que faz](#o-que-faz)
- [Arranque rápido](#arranque-rápido)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Estrutura](#estrutura)
- [Como funciona](#como-funciona)
- [Rotas](#rotas)
- [Segurança](#segurança)
- [Testes](#testes)
- [Deploy com Nixpacks](#deploy-com-nixpacks)
- [Operação](#operação)
- [Problemas comuns](#problemas-comuns)

---

## O que faz

- **Três perfis:**
  - visitante: vê, pesquisa e descarrega;
  - utilizador com conta Google: também envia memes e dá likes;
  - administrador: publica direto, aprova, rejeita, edita, remove e gere papéis.
- **Moderação:** o que um utilizador envia fica `pending`, com o ficheiro privado, até um administrador o aprovar.
- **Envio direto para o Cloudinary:** o browser envia o ficheiro com uma autorização assinada pela API, que nunca recebe os bytes.
- **Listagens:** pesquisa por título, filtro por tag, ordem recente, popular ou aleatória (com semente) e paginação.
- **Descargas:** com marca d'água nos vídeos e nas imagens, geradas pelo Cloudinary no próprio URL.
- **Likes:** idempotentes e contados na mesma instrução SQL.
- **API pública v1:** chaves por utilizador, limite por chave e por IP, e documentação em `/docs`.
- **Dados para SEO:** imagens de pré-visualização 1200×630 e endpoint para o sitemap do frontend.

## Arranque rápido

**Precisas de:**
- Node.js 22.9 ou mais recente;
- PostgreSQL 13 ou mais recente. A migração 0008 instala a extensão `pg_trgm`, por isso o utilizador da base tem de poder fazer `CREATE EXTENSION`;
- uma conta no [Cloudinary](https://cloudinary.com) (o plano grátis chega para desenvolver);
- um *Client ID* OAuth do Google, do tipo "Aplicação Web", com `http://localhost:3000` nas origens autorizadas.

```bash
cd backend
npm install
cp .env.example .env        # preenche os valores (ver tabela abaixo)
npm run db:migrate          # cria as tabelas
npm run dev                 # http://localhost:4000 (recarrega ao gravar)
```

Confirma que está tudo bem com `curl http://localhost:4000/health`. A documentação da API pública abre em `http://localhost:4000/docs`.

O frontend (Next.js) está em `../frontend` e fala com esta API através de `NEXT_PUBLIC_API_URL`.

## Variáveis de ambiente

Todas são validadas no arranque (`src/config/env.ts`): com uma em falta ou mal formada, a API não arranca e diz qual é.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Ligação ao PostgreSQL. Em bases geridas costuma levar `?sslmode=require`. |
| `JWT_SECRET` | sim | Assina os cookies de sessão. Mínimo 32 caracteres. Gera com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Mudá-lo termina todas as sessões. |
| `GOOGLE_CLIENT_ID` | sim | *Client ID* OAuth do Google; os tokens de login têm de ter este `aud`. |
| `FRONTEND_URL` | sim | Origem exata do site (ex.: `https://angomemes.site`). Serve para o CORS e para a proteção CSRF. Escreve-a sem `/` no fim. |
| `CLOUDINARY_URL` | sim | `cloudinary://<api_key>:<api_secret>@<cloud_name>`. Nunca a mandes para o frontend. |
| `ADMIN_EMAILS` | não | Emails separados por vírgulas que ficam administradores ao entrar. Estes não se podem despromover pelo painel. |
| `NODE_ENV` | não | `development` (por omissão), `test` ou `production`. Em produção os cookies passam a `Secure`, os logs saem em JSON e os ficheiros vão para a pasta `angomemes/production` do Cloudinary. |
| `PORT` | não | Porta HTTP (por omissão 4000). Os alojamentos definem-na sozinhos. |
| `TRUST_PROXY` | não | Quantos proxies estão à frente da API. Por omissão é 1 em produção e 0 no resto. Errado, os limites por IP ficam partilhados por toda a gente. |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Arranca com recarregamento automático (`tsx watch`), lendo o `.env`. |
| `npm run build` | Compila para `dist/`. |
| `npm start` | Corre a versão compilada, lendo o `.env` se existir. |
| `npm run start:prod` | Corre a versão compilada só com as variáveis do ambiente (o que o alojamento usa). |
| `npm run db:migrate` | Aplica as migrações em falta (a partir do código TypeScript). Aceita `-- pending`, `-- executed` e `-- down`. |
| `npm run db:migrate:prod` | O mesmo, a partir de `dist/` (sem devDependencies). |
| `npm test` | Testes unitários e de integração (Vitest). |
| `npm run typecheck` | Verifica os tipos sem compilar. |

## Estrutura

```
src/
├── app.ts                  # monta a app Express (middlewares e routers); usada também nos testes
├── server.ts               # arranque: ligação à base, servidor, limpeza periódica, encerramento limpo
├── config/env.ts           # validação das variáveis de ambiente (zod)
├── logger.ts               # pino + pino-http, sem cookies nem chaves nos registos
├── db/
│   ├── models/             # modelos Sequelize
│   ├── migrations/         # migrações numeradas (0001…); a lista está em migrator.ts
│   └── migrate.ts          # CLI das migrações
├── middlewares/            # sessão, permissões, CSRF, rate limits, upload, concorrência, erros
├── modules/
│   ├── auth/               # login com Google, sessão (JWT em cookie httpOnly)
│   ├── memes/              # listagem, detalhe, descargas, envios, tags, sitemap
│   ├── likes/
│   ├── admin/              # moderação e gestão de utilizadores
│   └── publicApi/          # API pública v1, chaves, OpenAPI
└── services/
    ├── storage/            # interface StorageService + Cloudinary + versão em memória (testes)
    └── google/             # verificação dos tokens do Google (+ versão falsa para testes)
```

Os serviços externos (Cloudinary e Google) entram por interfaces e são injetados em `createApp`. Nos testes usam-se as versões em memória, sem rede.

## Como funciona

### Ciclo de vida de um meme

```
                 ┌── aprovar ──▶ published ── remover ──▶ removed
envio ─▶ pending ┤
                 └── rejeitar ─▶ rejected (o ficheiro é apagado)
```

- O que um **administrador** envia entra logo como `published`.
- Só os `published` aparecem em listagens, pesquisas, descargas e na API pública; os outros estados dão 404 como se não existissem.
- Os ficheiros **pendentes e removidos** ficam no Cloudinary com entrega `authenticated` (privada). O painel vê-os por URLs temporários (1 hora).
- Aprovar e remover mudam o tipo de entrega do ficheiro no Cloudinary, sem o reenviar, e limpam a cache da CDN.
- As transições usam `SELECT … FOR UPDATE`: dois administradores ao mesmo tempo não aprovam e rejeitam o mesmo meme.

### Envio direto

1. `POST /memes/uploads { type }`: a API cria um **ticket** e devolve a autorização assinada. A assinatura fixa o `public_id`, o tipo de entrega (privada para pendentes), os formatos aceites e `overwrite=false`.
2. O browser envia o ficheiro para o Cloudinary (`uploadUrl` + `fields`).
3. `POST /memes/uploads/:ticketId { title, tags }`: a API pergunta ao Cloudinary o que chegou, confirma o formato e o tamanho do tipo (vídeo 50 MB, imagem 10 MB, áudio 5 MB) e cria o meme.

Os tickets não reclamados em 2 horas são apagados por uma limpeza que corre a cada 15 minutos. O envio clássico (`POST /memes`, multipart) continua a funcionar, com no máximo 4 envios em simultâneo por instância.

### Sessões

- O login com Google dá um JWT (HS256, 7 dias) num cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção.
- O papel lê-se da base em cada pedido, por isso uma promoção ou despromoção tem efeito imediato.
- O token leva a versão da sessão do utilizador: `POST /auth/logout-all` incrementa-a e termina as sessões em todos os aparelhos.

### URLs do Cloudinary

- **Assinatura:** todos os URLs públicos vão assinados (`s--…--`). Com **Strict transformations** ligado na consola do Cloudinary, só as transformações geradas pela API são aceites, e ninguém gasta créditos com variantes inventadas.
- **Miniaturas e imagem da página:** `f_auto,q_auto` (WebP/AVIF quando o browser aceita).
- **Pré-visualização dos links:** 1200×630 em JPG.

## Rotas

**API interna** (usada pelo site, com cookie de sessão):

| Método e caminho | Acesso | Descrição |
|---|---|---|
| `GET /health` | público | Estado do serviço (para o *health check* do alojamento). |
| `POST /auth/google` | público | Login com o `idToken` do Google. |
| `GET /auth/me` | sessão | Utilizador atual. |
| `POST /auth/logout` · `POST /auth/logout-all` | sessão | Sair neste aparelho · em todos. |
| `GET /memes` | público | Listagem (`type`, `q`, `tag`, `sort`, `seed`, `page`, `limit`). |
| `GET /memes/tags?type=` | público | Tags com memes publicados e a contagem. |
| `GET /memes/sitemap` | público | Dados mínimos de todos os publicados, para o sitemap. |
| `GET /memes/:slug` | público | Detalhe de um meme. |
| `GET /memes/:slug/download` | público | Redireciona para a descarga com marca d'água. |
| `POST /memes/uploads` · `POST /memes/uploads/:ticketId` | sessão | Envio direto (ticket · reclamar). |
| `POST /memes` | sessão | Envio clássico (multipart). |
| `PUT` · `DELETE /memes/:id/like` | sessão | Dar · retirar like. |
| `GET /me/likes?memeIds=` | sessão | Quais destes memes têm like da conta. |
| `GET` · `POST` · `DELETE /me/api-keys` | sessão | Chaves da API pública da própria pessoa. |
| `/admin/*` | admin | Estatísticas, moderação, edição, remoção e papéis. |

**API pública v1** (`Authorization: Bearer <chave>`, só leitura, CORS aberto): `GET /api/v1/memes`, `/api/v1/memes/random`, `/api/v1/memes/:idOrSlug`, `/api/v1/tags`.
- Limites: 60 pedidos por minuto por chave, 300 por minuto por IP e 5 chaves ativas por conta.
- A especificação OpenAPI está em `/api/v1/openapi.json` e a documentação interativa em `/docs`.
- É um contrato com terceiros: dentro da v1 só se **acrescentam** campos. O teste de contrato falha se o DTO e o schema divergirem.

## Segurança

- **Validação:**
  - todas as entradas passam por `zod`;
  - ids e slugs com formato impossível dão 404 sem ir à base;
  - os ficheiros são validados pelo conteúdo (`file-type`) e pelos `allowed_formats` assinados no Cloudinary.
- **CSRF:** além do `SameSite=Lax`, os pedidos que alteram dados vindos de outra origem são recusados (`Origin`/`Referer` comparado com o `FRONTEND_URL`).
- **Headers e CORS:**
  - `helmet` (CSP, HSTS e restantes headers de segurança);
  - CORS restrito ao frontend na API interna e aberto, mas sem cookies, na API pública.
- **Rate limits:**

  | Âmbito | Limite |
  |---|---|
  | Login | 20 por 15 min por IP |
  | Envios | 30 por hora por conta |
  | Likes | 60 por minuto por conta |
  | API pública | por chave e por IP |
  | Descargas | contam no máximo 3 vezes por IP e por meme por hora |

- **Chaves da API:** só o SHA-256 vai para a base. A chave aparece uma única vez, ao criar, e nunca nos logs.
- **Logs e erros:**
  - os logs ocultam `Authorization`, `Cookie` e `Set-Cookie`;
  - os erros internos respondem `500` genérico, com o detalhe só no log.

## Testes

```bash
npm test
```

- **Unitários:** regras do domínio, sessão, middlewares e URLs do Cloudinary.
- **Integração:** HTTP com Supertest, com o Cloudinary e o Google simulados.

Os testes não precisam de base de dados nem de rede. O que depende do PostgreSQL (consultas e transações) está coberto pelas validações que falham antes de chegar à base, e convém confirmá-lo à mão contra uma base de desenvolvimento quando se mexe em SQL.

## Deploy com Nixpacks

A configuração está em [`nixpacks.toml`](nixpacks.toml):

| Fase | O que faz |
|---|---|
| install | `npm ci --include=dev` (o TypeScript faz falta para compilar) |
| build | `npm run build` e depois `npm prune --omit=dev` (a imagem final só leva as dependências de produção) |
| start | `npm run db:migrate:prod && npm run start:prod` |

O Node é a versão 22 LTS, fixada por `NIXPACKS_NODE_VERSION`. O `engines` do `package.json` pede `>=22.9`, o mínimo para o `--env-file-if-exists` dos scripts de desenvolvimento.

### Passo a passo (Railway, Coolify, Sevalla ou outro com Nixpacks)

1. Cria o serviço a partir do repositório e define o **diretório raiz** como `backend/`.
2. Cria (ou liga) uma base PostgreSQL e põe o URL em `DATABASE_URL`.
3. Define as variáveis: `NODE_ENV=production`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `FRONTEND_URL`, `CLOUDINARY_URL` e, se quiseres, `ADMIN_EMAILS`. A `PORT` vem do alojamento.
4. Configura o *health check* para `GET /health`.
5. Publica. No arranque correm as migrações em falta e depois a API.

### Antes de abrir ao público

- **Domínios:** o frontend e a API têm de estar no **mesmo domínio** (ex.: `angomemes.site` e `api.angomemes.site`); senão o browser não manda o cookie de sessão. O `FRONTEND_URL` é a origem exata do site; se o site também abrir em `www.`, redireciona uma versão para a outra.
- **Cloudinary:** liga **Settings → Security → Strict transformations**.
- **Google:** junta o domínio de produção às origens autorizadas do *Client ID* e passa o ecrã de consentimento a "Em produção".
- **Proxy:** confirma o `TRUST_PROXY`. O valor 1 serve para quase todos os alojamentos (um balanceador à frente); com uma CDN como o Cloudflare à frente do balanceador, são 2.
- **Várias instâncias:** os rate limits e a cache das tags ficam em memória, por instância. Tira as migrações do arranque e corre-as uma vez no *pre-deploy* do alojamento (`npm run db:migrate:prod`), deixando o *start* só com `npm run start:prod`.
- **Backups:** liga as cópias de segurança diárias da base.

### Encerramento

Num redeploy a API recebe `SIGTERM`: deixa de aceitar ligações, termina os pedidos em curso (até 25 s) e fecha a base.

## Operação

- **Logs:** JSON (pino) em produção, um por pedido (o `/health` fica de fora), com nível `warn` para 4xx e `error` para 5xx.
- **Limpeza:** os envios diretos expirados são apagados a cada 15 minutos, por instância e sem dependências externas.
- **Migrações novas:** cria `src/db/migrations/00NN-descricao.ts` com `up` e `down` e junta-a à lista em `src/db/migrator.ts`. A lista é explícita, por isso funciona igual com `tsx` e depois do build.
- **Alertas sugeridos:** 5xx em `/memes` e `/auth`, consumo de créditos do Cloudinary e espaço da base.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| A API não arranca e lista variáveis | O `.env` (ou as variáveis do alojamento) está incompleto; a mensagem diz quais. |
| `403 FORBIDDEN_ORIGIN` ao enviar ou dar like | O site está numa origem diferente do `FRONTEND_URL` (http/https, `www`, porta). |
| Login funciona mas a sessão não fica | O frontend e a API estão em domínios diferentes, ou o site está em `http` com `NODE_ENV=production` (cookie `Secure`). |
| `429` em todos os logins | O `TRUST_PROXY` está mal e toda a gente parece vir do mesmo IP. |
| Imagens do Cloudinary dão 401 depois de ligar *strict* | Algum URL foi gerado sem assinatura; todos devem vir do `CloudinaryStorageService`. |
| `permission denied to create extension "pg_trgm"` | O utilizador da base não pode criar extensões: cria-a uma vez com um superutilizador. |
