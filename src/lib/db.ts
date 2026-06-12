import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

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

/** Cliente em cache do hot-reload pode ser anterior ao `prisma generate` do DRE. */
function prismaClientHasDreModels(client: PrismaClient): boolean {
  const delegate = (
    client as PrismaClient & {
      dreCostItem?: { findMany?: unknown };
    }
  ).dreCostItem;
  return typeof delegate?.findMany === "function";
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && prismaClientHasDreModels(cached)) {
    return cached;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();
