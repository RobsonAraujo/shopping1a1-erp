-- DropForeignKey
ALTER TABLE "kit_items" DROP CONSTRAINT "kit_items_organization_id_sku_fkey";

-- DropForeignKey
ALTER TABLE "product_sku_aliases" DROP CONSTRAINT "product_sku_aliases_organization_id_canonical_sku_fkey";

-- DropForeignKey
ALTER TABLE "dre_product_cost_levelings" DROP CONSTRAINT "dre_product_cost_levelings_organization_id_sku_fkey";

-- DropIndex
DROP INDEX "products_ml_item_id_key";

-- DropIndex
DROP INDEX "products_organization_id_sku_key";

-- DropIndex
DROP INDEX "kit_items_sku_idx";

-- AlterTable
ALTER TABLE "products" DROP CONSTRAINT "products_pkey",
DROP COLUMN "id",
ALTER COLUMN "sku" DROP NOT NULL,
ALTER COLUMN "ml_item_id" SET NOT NULL,
ADD CONSTRAINT "products_pkey" PRIMARY KEY ("ml_item_id");

-- AlterTable
ALTER TABLE "kit_items" DROP CONSTRAINT "kit_items_pkey",
DROP COLUMN "sku",
ALTER COLUMN "product_ml_item_id" SET NOT NULL,
ADD CONSTRAINT "kit_items_pkey" PRIMARY KEY ("kit_id", "product_ml_item_id");

-- DropTable
DROP TABLE "product_sku_aliases";

-- CreateIndex
CREATE INDEX "products_organization_id_idx" ON "products"("organization_id");

-- CreateIndex
CREATE INDEX "kit_items_product_ml_item_id_idx" ON "kit_items"("product_ml_item_id");

-- CreateIndex
CREATE INDEX "dre_product_cost_levelings_product_ml_item_id_idx" ON "dre_product_cost_levelings"("product_ml_item_id");

-- AddForeignKey
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_product_ml_item_id_fkey" FOREIGN KEY ("product_ml_item_id") REFERENCES "products"("ml_item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull (não Cascade) de propósito: nivelamento de custo é histórico e
-- deve sobreviver à exclusão do Product atual (ex.: produto sem anúncio
-- vivo correspondente) — perde só o vínculo, mantém sku/datas/custo.
ALTER TABLE "dre_product_cost_levelings" ADD CONSTRAINT "dre_product_cost_levelings_product_ml_item_id_fkey" FOREIGN KEY ("product_ml_item_id") REFERENCES "products"("ml_item_id") ON DELETE SET NULL ON UPDATE CASCADE;
