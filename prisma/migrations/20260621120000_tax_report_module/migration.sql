-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('lucro_real', 'lucro_presumido', 'simples');

-- AlterTable products
ALTER TABLE "products"
  ADD COLUMN "is_imported" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "import_content_percent" DECIMAL(8,4) NOT NULL DEFAULT 0;

-- AlterTable company_tax_settings
ALTER TABLE "company_tax_settings"
  ADD COLUMN "tax_regime" "TaxRegime" NOT NULL DEFAULT 'lucro_real',
  ADD COLUMN "origin_uf" TEXT NOT NULL DEFAULT 'SP',
  ADD COLUMN "pis_rate_percent" DECIMAL(8,4) NOT NULL DEFAULT 1.65,
  ADD COLUMN "cofins_rate_percent" DECIMAL(8,4) NOT NULL DEFAULT 7.6,
  ADD COLUMN "exclude_icms_from_pis_cofins_base" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "irpj_additional_threshold" DECIMAL(18,2) NOT NULL DEFAULT 20000;

-- CreateTable icms_internal_rates
CREATE TABLE "icms_internal_rates" (
  "uf" TEXT NOT NULL,
  "aliquota_base" DECIMAL(8,4) NOT NULL,
  "fcp" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "icms_internal_rates_pkey" PRIMARY KEY ("uf")
);

-- CreateTable cbs_ibs_vigencia
CREATE TABLE "cbs_ibs_vigencia" (
  "year" INTEGER NOT NULL,
  "cbs_rate" DECIMAL(8,4),
  "ibs_estadual_rate" DECIMAL(8,4),
  "ibs_municipal_rate" DECIMAL(8,4),
  "notes" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cbs_ibs_vigencia_pkey" PRIMARY KEY ("year")
);

-- CreateTable tax_report_month_snapshots
CREATE TABLE "tax_report_month_snapshots" (
  "id" TEXT NOT NULL,
  "seller_id" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,

  CONSTRAINT "tax_report_month_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_report_month_snapshots_seller_id_year_month_key" ON "tax_report_month_snapshots"("seller_id", "year", "month");
CREATE INDEX "tax_report_month_snapshots_year_month_idx" ON "tax_report_month_snapshots"("year", "month");

-- CreateTable taxpayer_verification_cache
CREATE TABLE "taxpayer_verification_cache" (
  "cnpj" TEXT NOT NULL,
  "is_contributor" BOOLEAN NOT NULL,
  "provider" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "taxpayer_verification_cache_pkey" PRIMARY KEY ("cnpj")
);

CREATE INDEX "taxpayer_verification_cache_expires_at_idx" ON "taxpayer_verification_cache"("expires_at");

-- Seed ICMS internal rates (TODO: validar com CONFAZ/RICMS de cada estado)
INSERT INTO "icms_internal_rates" ("uf", "aliquota_base", "fcp", "updated_at") VALUES
  ('AC', 0.17, 0, NOW()),
  ('AL', 0.19, 0.01, NOW()),
  ('AM', 0.18, 0, NOW()),
  ('AP', 0.18, 0, NOW()),
  ('BA', 0.205, 0.02, NOW()),
  ('CE', 0.18, 0, NOW()),
  ('DF', 0.18, 0, NOW()),
  ('ES', 0.17, 0, NOW()),
  ('GO', 0.17, 0, NOW()),
  ('MA', 0.18, 0, NOW()),
  ('MG', 0.18, 0, NOW()),
  ('MS', 0.17, 0, NOW()),
  ('MT', 0.17, 0, NOW()),
  ('PA', 0.17, 0, NOW()),
  ('PB', 0.18, 0, NOW()),
  ('PE', 0.18, 0, NOW()),
  ('PI', 0.18, 0, NOW()),
  ('PR', 0.19, 0, NOW()),
  ('RJ', 0.20, 0.02, NOW()),
  ('RN', 0.18, 0, NOW()),
  ('RO', 0.175, 0, NOW()),
  ('RR', 0.17, 0, NOW()),
  ('RS', 0.17, 0, NOW()),
  ('SC', 0.17, 0, NOW()),
  ('SE', 0.19, 0, NOW()),
  ('SP', 0.18, 0, NOW()),
  ('TO', 0.18, 0, NOW());

-- Seed CBS/IBS vigência (informativo)
INSERT INTO "cbs_ibs_vigencia" ("year", "cbs_rate", "ibs_estadual_rate", "ibs_municipal_rate", "notes", "updated_at") VALUES
  (2026, 0.009, 0.001, 0, 'Fase teste LC 214/2025 — compensado com PIS/COFINS', NOW()),
  (2027, NULL, 0.0005, 0.0005, 'Alíquota CBS = referência − 0,1% — atualizar anualmente', NOW()),
  (2028, NULL, 0.0005, 0.0005, 'Alíquota CBS = referência − 0,1% — atualizar anualmente', NOW());
