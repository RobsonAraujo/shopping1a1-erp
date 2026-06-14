-- CreateEnum
CREATE TYPE "OperationCycleKind" AS ENUM ('purchase', 'full');

-- Add kind column (nullable during backfill)
ALTER TABLE "replenishment_cycles" ADD COLUMN "kind" "OperationCycleKind";

-- Backfill kind + remap legacy statuses
UPDATE "replenishment_cycles"
SET "kind" = 'full'
WHERE "status"::text = 'full_pending';

UPDATE "replenishment_cycles"
SET "kind" = 'purchase', "status" = 'ordered'
WHERE "status"::text = 'in_warehouse';

UPDATE "replenishment_cycles"
SET "kind" = 'purchase'
WHERE "kind" IS NULL;

ALTER TABLE "replenishment_cycles" ALTER COLUMN "kind" SET NOT NULL;

-- Replace enum: drop in_warehouse / full_pending, add scheduled
CREATE TYPE "ReplenishmentStatus_new" AS ENUM (
  'attention',
  'analyzing',
  'quoted',
  'ordered',
  'scheduled',
  'completed'
);

ALTER TABLE "replenishment_cycles"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ReplenishmentStatus_new"
  USING (
    CASE "status"::text
      WHEN 'in_warehouse' THEN 'ordered'
      WHEN 'full_pending' THEN 'attention'
      ELSE "status"::text
    END
  )::"ReplenishmentStatus_new";

DROP TYPE "ReplenishmentStatus";
ALTER TYPE "ReplenishmentStatus_new" RENAME TO "ReplenishmentStatus";

-- Remap full cycles that were full_pending -> attention
-- (status already mapped above; ensure kind is full for those still at attention from full_pending)
-- Rows that were full_pending already have kind='full' from first UPDATE.

DROP INDEX IF EXISTS "replenishment_cycles_ml_item_id_status_idx";
CREATE INDEX "replenishment_cycles_ml_item_id_kind_status_idx"
  ON "replenishment_cycles"("ml_item_id", "kind", "status");
