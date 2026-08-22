import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
import { tenantGuardExtension } from "@/lib/db-tenant-guard";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg(url);
  return new PrismaClient({ adapter });
}

/** Cliente em cache do hot-reload pode ser anterior ao `prisma generate`. */
function prismaClientHasExpectedModels(client: PrismaClient): boolean {
  const delegate = client as PrismaClient & {
    dreCostItem?: { findMany?: unknown };
    replenishmentCycle?: { findMany?: unknown };
    revenueSimulation?: { findMany?: unknown };
  };
  return (
    typeof delegate.dreCostItem?.findMany === "function" &&
    typeof delegate.replenishmentCycle?.findMany === "function" &&
    typeof delegate.revenueSimulation?.findMany === "function"
  );
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && prismaClientHasExpectedModels(cached)) {
    return cached;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient().$extends(tenantGuardExtension);
