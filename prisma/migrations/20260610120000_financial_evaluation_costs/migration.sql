-- AlterTable
ALTER TABLE "warehouse_stock" ADD COLUMN "extra_costs" DECIMAL(18,2),
ADD COLUMN "tax_rate_percent" DECIMAL(8,4);
