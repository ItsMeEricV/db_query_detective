import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Don't bundle these — load them from node_modules at runtime. libpg-query
  // ships a .wasm the bundler won't trace; Prisma + the pg adapter likewise
  // expect to be required as real packages on the server.
  serverExternalPackages: ['libpg-query', '@prisma/client', '@prisma/adapter-pg'],
};

export default nextConfig;
