-- CreateEnum
CREATE TYPE "InventoryMonthSnapshotStatus" AS ENUM ('pending', 'in_progress', 'done', 'failed');

-- CreateTable
CREATE TABLE "inventory_month_snapshot_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "InventoryMonthSnapshotStatus" NOT NULL DEFAULT 'pending',
    "items_snapshotted" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_month_snapshot_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock_month_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "ml_item_id" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "ncm" TEXT,
    "unit_cost" DECIMAL(18,2),
    "warehouse_stock" INTEGER NOT NULL,
    "ml_stock" INTEGER NOT NULL,
    "ml_stock_on_the_way" INTEGER NOT NULL DEFAULT 0,
    "catalog_listing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_stock_month_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_month_snapshot_runs_status_updated_at_idx" ON "inventory_month_snapshot_runs"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_month_snapshot_runs_organization_id_year_month_key" ON "inventory_month_snapshot_runs"("organization_id", "year", "month");

-- CreateIndex
CREATE INDEX "inventory_stock_month_snapshots_organization_id_year_month_idx" ON "inventory_stock_month_snapshots"("organization_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_month_snapshots_organization_id_ml_item_id__key" ON "inventory_stock_month_snapshots"("organization_id", "ml_item_id", "year", "month");
