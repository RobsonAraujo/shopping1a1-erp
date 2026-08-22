-- Fase 7 (Hardening): aperta `organization_id` para NOT NULL nas 15 tabelas
-- que ainda estavam nullable desde a Fase 2 (ver docs/architecture/saas-migration.md).
-- Todas já têm suas queries em lote escopadas por organizationId (guard-rail
-- em src/lib/db-tenant-guard.ts) — esta migration só remove a lacuna de
-- integridade que restava no schema.
--
-- Mesmo backfill defensivo idempotente das migrations da Fase 2
-- (20260821190000_product_org_composite_key): garante 1 Organization
-- "default" (se nenhuma existir) e preenche organization_id em toda linha
-- ainda NULL antes de travar a constraint — não depende de
-- `npm run backfill:default-organization` ter rodado antes.
INSERT INTO "organizations" ("id", "name", "slug", "status", "status_updated_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'Shopping 1a1', 'default', 'active', now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "organizations");

UPDATE "listings" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "kits" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "warehouse_stock" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "replenishment_cycles" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "catalog_competition_snapshots" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "catalog_competition_poll_runs" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "stock_attention_acknowledgements" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "full_shipments" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "dre_cost_items" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "dre_cost_month_values" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "tax_fixed_cost_items" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "tax_fixed_cost_month_values" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "tax_fixed_cost_month_exclusions" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "tax_report_month_snapshots" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "revenue_simulations" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

-- AlterTable
ALTER TABLE "catalog_competition_poll_runs" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "catalog_competition_snapshots" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "dre_cost_items" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "dre_cost_month_values" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "full_shipments" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "kits" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "listings" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "replenishment_cycles" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "revenue_simulations" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "stock_attention_acknowledgements" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "tax_fixed_cost_items" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "tax_fixed_cost_month_exclusions" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "tax_fixed_cost_month_values" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "tax_report_month_snapshots" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "warehouse_stock" ALTER COLUMN "organization_id" SET NOT NULL;
