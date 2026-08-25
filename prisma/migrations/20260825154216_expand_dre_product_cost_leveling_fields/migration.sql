-- AlterTable
ALTER TABLE "dre_product_cost_levelings" ADD COLUMN     "extra_costs" DECIMAL(18,2),
ADD COLUMN     "is_imported" BOOLEAN,
ADD COLUMN     "is_monophasic" BOOLEAN,
ADD COLUMN     "pma_price" DECIMAL(18,2),
ADD COLUMN     "purchase_icms_percent" DECIMAL(8,4),
ADD COLUMN     "sale_icms_percent" DECIMAL(8,4);
