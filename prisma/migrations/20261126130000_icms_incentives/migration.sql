-- Incentivo fiscal de ICMS por NCM (venda interna) + "não se aplica" no produto.
CREATE TYPE "IcmsIncentiveAppliesTo" AS ENUM ('all', 'contribuinte');

CREATE TABLE "icms_incentives" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ncm" TEXT NOT NULL,
    "rate_percent" DECIMAL(8,4) NOT NULL,
    "applies_to" "IcmsIncentiveAppliesTo" NOT NULL DEFAULT 'all',
    "valid_from" DATE,
    "valid_to" DATE,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icms_incentives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "icms_incentives_organization_id_ncm_key" ON "icms_incentives"("organization_id", "ncm");

ALTER TABLE "products" ADD COLUMN "icms_incentive_excluded" BOOLEAN NOT NULL DEFAULT false;
