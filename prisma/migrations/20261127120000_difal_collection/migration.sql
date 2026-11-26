-- Onde a empresa recolhe o DIFAL (todos / nenhum / só alguns estados).
CREATE TYPE "DifalCollection" AS ENUM ('all', 'none', 'some');

ALTER TABLE "company_tax_settings"
  ADD COLUMN "difal_collection" "DifalCollection" NOT NULL DEFAULT 'all',
  ADD COLUMN "difal_collected_ufs" TEXT[] DEFAULT ARRAY[]::TEXT[];
