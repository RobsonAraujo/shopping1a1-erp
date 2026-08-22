-- Fase 2 (parcial, DRE): `dre_month_snapshots` tinha `@@unique([year, month])`
-- global — duas organizações não conseguiam ter snapshot no mesmo mês
-- (mesmo bloqueador estrutural do antigo `products.sku`). Vira
-- `@@unique([organization_id, year, month])`.
--
-- Backfill defensivo idempotente (mesmo padrão de
-- 20260821190000_product_org_composite_key): garante que organization_id
-- esteja preenchido mesmo que o script de backfill não tenha rodado ainda
-- neste ambiente, usando a única Organization existente (ou a mais antiga,
-- se por algum motivo houver mais de uma nesta migration específica).
INSERT INTO "organizations" ("id", "name", "slug", "status", "status_updated_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'Shopping 1a1', 'default', 'active', now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "organizations");

UPDATE "dre_month_snapshots" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

-- DropIndex
DROP INDEX "dre_month_snapshots_organization_id_idx";

-- DropIndex
DROP INDEX "dre_month_snapshots_year_month_key";

-- AlterTable
ALTER TABLE "dre_month_snapshots" ALTER COLUMN "organization_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "dre_month_snapshots_organization_id_year_month_key" ON "dre_month_snapshots"("organization_id", "year", "month");
