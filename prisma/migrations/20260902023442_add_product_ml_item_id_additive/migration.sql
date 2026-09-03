-- AlterTable
ALTER TABLE "dre_product_cost_levelings" ADD COLUMN     "product_ml_item_id" TEXT;

-- AlterTable
ALTER TABLE "kit_items" ADD COLUMN     "product_ml_item_id" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "ml_item_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "products_ml_item_id_key" ON "products"("ml_item_id");

