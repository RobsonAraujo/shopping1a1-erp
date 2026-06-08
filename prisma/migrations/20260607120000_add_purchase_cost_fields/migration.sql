-- AlterTable
ALTER TABLE "warehouse_stock" ADD COLUMN "last_purchase_price" DECIMAL(18,2),
ADD COLUMN "min_acceptable_price" DECIMAL(18,2),
ADD COLUMN "target_coverage_days" INTEGER;
