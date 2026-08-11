-- Registra no histórico do Prisma a tabela flex_distance_tiers, que já existia no banco
-- (criada fora do fluxo de migrations). Este arquivo é marcado como aplicado via
-- `prisma migrate resolve --applied`, sem executar o CREATE TABLE, pois a tabela e seus
-- dados já existem.
CREATE TABLE "flex_distance_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "carrier_cost" DECIMAL(18,2) NOT NULL,
    "ml_bonus" DECIMAL(18,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flex_distance_tiers_pkey" PRIMARY KEY ("id")
);
