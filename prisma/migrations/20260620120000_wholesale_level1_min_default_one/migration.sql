-- Nível 1 = âncora ML (1 unidade)
ALTER TABLE "company_tax_settings"
  ALTER COLUMN "wholesale_level1_min_purchase_unit" SET DEFAULT 1;

UPDATE "company_tax_settings"
SET "wholesale_level1_min_purchase_unit" = 1
WHERE "wholesale_level1_min_purchase_unit" <> 1;
