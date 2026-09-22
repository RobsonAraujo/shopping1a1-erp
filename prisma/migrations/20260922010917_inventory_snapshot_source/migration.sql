-- CreateEnum
CREATE TYPE "InventoryMonthSnapshotSource" AS ENUM ('auto', 'manual');

-- AlterTable
ALTER TABLE "inventory_month_snapshot_runs" ADD COLUMN     "source" "InventoryMonthSnapshotSource" NOT NULL DEFAULT 'auto';
