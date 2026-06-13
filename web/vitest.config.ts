import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" -> "src/*" path alias.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests (ddl-service) hit the local dockerized Postgres.
    // Override DATABASE_URL to point elsewhere; defaults to the main worktree DB.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5433/db_query_detective_dev_main',
    },
  },
});
