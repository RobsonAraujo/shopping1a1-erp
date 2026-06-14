ALTER TABLE "replenishment_cycles"
  ADD COLUMN IF NOT EXISTS "ml_qty_at_collection" INTEGER;
