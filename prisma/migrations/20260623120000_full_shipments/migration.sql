-- CreateEnum
CREATE TYPE "FullShipmentSource" AS ENUM ('manual', 'ml_billing');

-- CreateTable
CREATE TABLE "full_shipments" (
    "id" TEXT NOT NULL,
    "shipped_at" TIMESTAMP(3) NOT NULL,
    "total_cost" DECIMAL(18,2) NOT NULL,
    "total_units" INTEGER NOT NULL,
    "cost_per_unit" DECIMAL(18,4) NOT NULL,
    "source" "FullShipmentSource" NOT NULL DEFAULT 'manual',
    "ml_charge_detail_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "full_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "full_shipments_ml_charge_detail_id_key" ON "full_shipments"("ml_charge_detail_id");

-- CreateIndex
CREATE INDEX "full_shipments_shipped_at_idx" ON "full_shipments"("shipped_at");
