-- AlterTable
ALTER TABLE "full_shipments" ADD COLUMN "ml_inbound_id" TEXT;
ALTER TABLE "full_shipments" ADD COLUMN "product_count" INTEGER;

-- DropIndex
DROP INDEX IF EXISTS "full_shipments_ml_charge_detail_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "full_shipments_ml_inbound_id_key" ON "full_shipments"("ml_inbound_id");
