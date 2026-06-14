import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Don't bundle these — load them from node_modules at runtime. libpg-query
  // ships a .wasm the bundler won't trace; Prisma + the pg adapter likewise
  // expect to be required as real packages on the server.
  serverExternalPackages: ['libpg-query', '@prisma/client', '@prisma/adapter-pg', 'pg'],
  // The docker stack maps host :3005 → container :3000, so the browser's origin
  // (127.0.0.1/localhost:3005) differs from the dev server's. Without this,
  // Next 16 blocks the HMR WebSocket as cross-origin, which takes down the
  // Turbopack dev runtime that also drives hydration — the page renders but
  // never becomes interactive. Dev-only; no production effect.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
