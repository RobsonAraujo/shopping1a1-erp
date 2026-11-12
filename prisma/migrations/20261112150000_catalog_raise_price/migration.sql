-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "catalog_competitors" JSONB,
ADD COLUMN     "catalog_competitors_at" TIMESTAMP(3),
ADD COLUMN     "catalog_product_id" TEXT;

-- AlterTable
ALTER TABLE "operational_settings" ADD COLUMN     "rotina_catalog_raise_cushion_percent" DECIMAL(6,2),
ADD COLUMN     "rotina_catalog_raise_min_percent" DECIMAL(6,2);
