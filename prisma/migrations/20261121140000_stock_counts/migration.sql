-- Estoque automático (Fase 3): inventário mensal (folha para conferência
-- física, digitação, aprovação dos ajustes). Só aditiva.

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('counting', 'approved', 'cancelled');

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'counting',
    "reference_at" TIMESTAMP(3) NOT NULL,
    "blind" BOOLEAN NOT NULL DEFAULT false,
    "supplier_name" TEXT,
    "only_with_stock" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_ml_user_id" BIGINT,
    "approved_at" TIMESTAMP(3),
    "approved_by_ml_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" TEXT NOT NULL,
    "count_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "supplier_name" TEXT NOT NULL,
    "expected_own_qty" INTEGER NOT NULL,
    "pending_shipment_qty" INTEGER NOT NULL DEFAULT 0,
    "counted_qty" INTEGER,
    "note" TEXT,
    "unit_cost" DECIMAL(18,4),
    "adjustment_qty" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_counts_organization_id_created_at_idx" ON "stock_counts"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_count_lines_organization_id_idx" ON "stock_count_lines"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_count_id_stock_item_id_key" ON "stock_count_lines"("count_id", "stock_item_id");

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
