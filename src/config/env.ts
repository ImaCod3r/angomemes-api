import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  // Lista separada por vírgulas; quem entrar com um destes emails fica admin.
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  FRONTEND_URL: z.url(),
  // Domínio do cookie de sessão (ex.: `angomemes.site`). Faz falta quando o site e a API estão
  // em subdomínios diferentes: sem ele o cookie fica só no host da API e o servidor do Next.js,
  // que lê os cookies do site, nunca o vê. Vazio: o cookie fica só no host da API.
  COOKIE_DOMAIN: z
    .string()
    .trim()
    .transform((value) => value.replace(/^\./, '') || undefined)
    .optional(),
  // Quantos proxies (balanceador, CDN) estão à frente da API. Sem isto, atrás de um proxy
  // todos os pedidos parecem vir do mesmo IP e os limites por IP ficam partilhados.
  // Por omissão: 1 em produção, 0 no resto.
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),
  // Lido também diretamente pelo SDK do Cloudinary.
  CLOUDINARY_URL: z
    .string()
    .regex(/^cloudinary:\/\/[^:]+:[^@]+@.+$/, 'formato: cloudinary://<api_key>:<api_secret>@<cloud_name>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`);
}

export const env = {
  ...parsed.data,
  TRUST_PROXY: parsed.data.TRUST_PROXY ?? (parsed.data.NODE_ENV === 'production' ? 1 : 0),
};