-- AlterTable
ALTER TABLE "company_tax_settings"
ADD COLUMN "wholesale_level1_reduction_percent" DECIMAL(8,4) NOT NULL DEFAULT 10,
ADD COLUMN "wholesale_level2_reduction_percent" DECIMAL(8,4) NOT NULL DEFAULT 15,
ADD COLUMN "wholesale_level3_reduction_percent" DECIMAL(8,4) NOT NULL DEFAULT 20;
