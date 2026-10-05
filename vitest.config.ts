import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      // Os testes não usam base de dados; o valor só satisfaz a validação do env.
      DATABASE_URL: 'postgres://invalid',
      JWT_SECRET: 'test-secret-com-pelo-menos-32-caracteres',
      GOOGLE_CLIENT_ID: 'test-client-id',
      ADMIN_EMAILS: 'admin@example.com',
      FRONTEND_URL: 'http://localhost:3000',
      CLOUDINARY_URL: 'cloudinary://test-key:test-secret@test-cloud',
    },
  },
});
