import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getDatabaseUrl } from '@/environment';

/** Build a PrismaClient wired to the node-postgres driver adapter + DATABASE_URL. */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatabaseUrl() }) });
}

// Reuse one client across hot-reloads and serverless invocations — a fresh pool
// per reload exhausts connections. Cached on globalThis in every environment.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = (globalForPrisma.prisma ??= createPrismaClient());
