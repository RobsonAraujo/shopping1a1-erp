-- CreateEnum
CREATE TYPE "ReplenishmentStatus" AS ENUM (
  'attention',
  'analyzing',
  'quoted',
  'ordered',
  'in_warehouse',
  'full_pending',
  'completed'
);

-- CreateTable
CREATE TABLE "replenishment_cycles" (
  "id" TEXT NOT NULL,
  "ml_item_id" TEXT NOT NULL,
  "status" "ReplenishmentStatus" NOT NULL,
  "trigger_ml_qty" INTEGER NOT NULL,
  "trigger_warehouse_qty" INTEGER NOT NULL,
  "trigger_lead_time_days" INTEGER,
  "trigger_purchase_at" TIMESTAMP(3),
  "warehouse_qty_at_order" INTEGER,
  "suggested_qty" INTEGER,
  "notes" TEXT,
  "completed_ml_qty" INTEGER,
  "completed_warehouse_qty" INTEGER,
  "completed_lead_time_days" INTEGER,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "replenishment_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "replenishment_cycles_ml_item_id_status_idx" ON "replenishment_cycles"("ml_item_id", "status");

-- CreateIndex
CREATE INDEX "replenishment_cycles_status_idx" ON "replenishment_cycles"("status");

-- AddForeignKey
ALTER TABLE "replenishment_cycles"
  ADD CONSTRAINT "replenishment_cycles_ml_item_id_fkey"
  FOREIGN KEY ("ml_item_id") REFERENCES "listings"("ml_item_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
