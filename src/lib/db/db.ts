import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
import { tenantGuardExtension } from "@/lib/db/db-tenant-guard";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // Sem isso, `pg.Pool` assume max: 10 por instância — em serverless, cada
  // cold start cria seu próprio pool nunca descartado, então o teto real de
  // conexões no Postgres é (instâncias concorrentes × max), não um número
  // fixo. Configurável via env pra ajustar sem novo deploy quando o pooler
  // (PgBouncer/Supabase) tiver um limite conhecido.
  const adapter = new PrismaPg({
    connectionString: url,
    max: envInt("DATABASE_POOL_MAX", 5),
    idleTimeoutMillis: envInt("DATABASE_POOL_IDLE_TIMEOUT_MS", 10_000),
    connectionTimeoutMillis: envInt("DATABASE_POOL_CONNECT_TIMEOUT_MS", 10_000),
  });
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
