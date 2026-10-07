-- DropIndex
DROP INDEX "replenishment_cycles_column_id_idx";

-- AlterTable
ALTER TABLE "replenishment_cycles" ADD COLUMN     "position" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: congela a ordem que o board já mostrava (updated_at desc) como
-- ordem manual inicial — dali em diante só o usuário mexe nela.
UPDATE "replenishment_cycles" AS rc
SET "position" = ranked.rn * 1024
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "organization_id", "kind", "column_id"
           ORDER BY "updated_at" DESC
         ) AS rn
  FROM "replenishment_cycles"
  WHERE "status" <> 'completed'
) AS ranked
WHERE rc."id" = ranked."id";

-- CreateIndex
CREATE INDEX "replenishment_cycles_column_id_position_idx" ON "replenishment_cycles"("column_id", "position");
