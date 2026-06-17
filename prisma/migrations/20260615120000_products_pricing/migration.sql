-- CreateTable
CREATE TABLE "products" (
  "sku" TEXT NOT NULL,
  "ncm" TEXT,
  "unit_cost_nf" DECIMAL(18,2) NOT NULL,
  "purchase_icms_percent" DECIMAL(8,4) NOT NULL,
  "has_icms_st" BOOLEAN NOT NULL DEFAULT false,
  "purchase_cost_with_st" DECIMAL(18,2),
  "ipi_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "extra_costs" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "is_monophasic" BOOLEAN NOT NULL DEFAULT false,
  "sale_icms_percent" DECIMAL(8,4) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "products_pkey" PRIMARY KEY ("sku")
);

-- CreateTable
CREATE TABLE "company_tax_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "pis_cofins_percent" DECIMAL(8,4) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "company_tax_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "company_tax_settings" ("id", "pis_cofins_percent", "updated_at")
VALUES ('default', 9.25, CURRENT_TIMESTAMP);

ALTER TABLE "warehouse_stock" DROP COLUMN IF EXISTS "last_purchase_price";
ALTER TABLE "warehouse_stock" DROP COLUMN IF EXISTS "min_acceptable_price";
ALTER TABLE "warehouse_stock" DROP COLUMN IF EXISTS "extra_costs";
ALTER TABLE "warehouse_stock" DROP COLUMN IF EXISTS "tax_rate_percent";
