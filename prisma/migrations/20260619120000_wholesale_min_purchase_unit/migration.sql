ALTER TABLE "company_tax_settings"
ADD COLUMN "wholesale_level1_min_purchase_unit" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "wholesale_level2_min_purchase_unit" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "wholesale_level3_min_purchase_unit" INTEGER NOT NULL DEFAULT 10;
