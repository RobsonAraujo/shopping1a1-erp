-- Fase 2 (parcial, Grupo A): Product deixa de ter `sku` como PK global e
-- passa a ter `id` sintético + unique composto (organization_id, sku), pois
-- dois vendedores diferentes podem cadastrar o mesmo SKU. `company_tax_settings`
-- também deixa de ser singleton (`id: "default"`).
--
-- IMPORTANTE: `organization_id SET NOT NULL` só funciona se TODA linha já
-- tiver `organization_id` preenchido. O ideal é rodar
-- `npm run backfill:default-organization` antes de aplicar esta migration —
-- mas como `prisma migrate deploy` aplica todas as migrations pendentes em
-- sequência (sem pausa pra rodar o script no meio), o bloco abaixo faz um
-- backfill defensivo idempotente: garante 1 Organization "default" (se
-- nenhuma existir ainda) e preenche organization_id nas 5 tabelas que esta
-- migration está prestes a travar como NOT NULL. Não substitui rodar o
-- script — ele também cria User/OrganizationMember/OrganizationMlSeller, que
-- esta migration não mexe.
INSERT INTO "organizations" ("id", "name", "slug", "status", "status_updated_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'Shopping 1a1', 'default', 'active', now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "organizations");

UPDATE "products" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "kit_items" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "product_sku_aliases" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "dre_product_cost_levelings" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

UPDATE "company_tax_settings" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
WHERE "organization_id" IS NULL;

-- DropForeignKey
ALTER TABLE "dre_product_cost_levelings" DROP CONSTRAINT "dre_product_cost_levelings_sku_fkey";

-- DropForeignKey
ALTER TABLE "kit_items" DROP CONSTRAINT "kit_items_sku_fkey";

-- DropForeignKey
ALTER TABLE "product_sku_aliases" DROP CONSTRAINT "product_sku_aliases_canonical_sku_fkey";

-- DropIndex
DROP INDEX "company_tax_settings_organization_id_idx";

-- DropIndex
DROP INDEX "product_sku_aliases_organization_id_idx";

-- DropIndex
DROP INDEX "products_organization_id_idx";

-- AlterTable: company_tax_settings (sem coluna nova, só aperta constraints)
ALTER TABLE "company_tax_settings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "dre_product_cost_levelings" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "kit_items" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable: products — troca de PK (sku -> id sintético)
ALTER TABLE "products" ADD COLUMN "id" TEXT;
UPDATE "products" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "products" ALTER COLUMN "id" SET NOT NULL,
ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "products" DROP CONSTRAINT "products_pkey",
ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");

-- AlterTable: product_sku_aliases — troca de PK (alias_sku -> id sintético)
ALTER TABLE "product_sku_aliases" ADD COLUMN "id" TEXT;
UPDATE "product_sku_aliases" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "product_sku_aliases" ALTER COLUMN "id" SET NOT NULL,
ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "product_sku_aliases" DROP CONSTRAINT "product_sku_aliases_pkey",
ADD CONSTRAINT "product_sku_aliases_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "company_tax_settings_organization_id_key" ON "company_tax_settings"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_aliases_organization_id_alias_sku_key" ON "product_sku_aliases"("organization_id", "alias_sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products"("organization_id", "sku");

-- AddForeignKey
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_organization_id_sku_fkey" FOREIGN KEY ("organization_id", "sku") REFERENCES "products"("organization_id", "sku") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sku_aliases" ADD CONSTRAINT "product_sku_aliases_organization_id_canonical_sku_fkey" FOREIGN KEY ("organization_id", "canonical_sku") REFERENCES "products"("organization_id", "sku") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dre_product_cost_levelings" ADD CONSTRAINT "dre_product_cost_levelings_organization_id_sku_fkey" FOREIGN KEY ("organization_id", "sku") REFERENCES "products"("organization_id", "sku") ON DELETE CASCADE ON UPDATE CASCADE;
