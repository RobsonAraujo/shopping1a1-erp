-- Estoque automático (Fase 1): livro de estoque por item físico (user_product_id),
-- saldos Em casa, leitura do ML (depósito/Full), entradas, lotes de custo (PEPS),
-- pendências (venda sem item, devolução a conferir, entrada no Full) e cursor
-- da sincronização. Só aditiva: nada existente é alterado ou apagado.

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('opening', 'entry', 'entry_reversal', 'sale', 'sale_reversal', 'return_in', 'full_transfer', 'adjustment', 'manual_out', 'inventory_count');

-- CreateEnum
CREATE TYPE "StockLocation" AS ENUM ('own', 'full');

-- CreateEnum
CREATE TYPE "StockMovementSource" AS ENUM ('activation', 'ml_order', 'entry', 'manual', 'review', 'inventory');

-- CreateEnum
CREATE TYPE "StockEntryStatus" AS ENUM ('active', 'reversed');

-- CreateEnum
CREATE TYPE "StockLotStatus" AS ENUM ('queued', 'active', 'depleted');

-- CreateEnum
CREATE TYPE "StockReviewKind" AS ENUM ('unmapped_sale', 'return_to_check', 'full_inbound');

-- CreateEnum
CREATE TYPE "StockReviewStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "listing_type_id" TEXT,
ADD COLUMN     "stock_item_id" TEXT,
ADD COLUMN     "user_product_id" TEXT;

-- CreateTable
CREATE TABLE "stock_settings" (
    "organization_id" TEXT NOT NULL,
    "activated_at" TIMESTAMP(3) NOT NULL,
    "activated_by_ml_user_id" BIGINT,
    "legacy_warehouse_includes_ml" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "stock_sync_state" (
    "organization_id" TEXT NOT NULL,
    "ml_user_id" BIGINT NOT NULL,
    "orders_cursor" TIMESTAMP(3) NOT NULL,
    "seller_node_ids" JSONB NOT NULL DEFAULT '[]',
    "last_orders_sync_at" TIMESTAMP(3),
    "last_positions_sync_at" TIMESTAMP(3),
    "last_run_started_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_sync_state_pkey" PRIMARY KEY ("organization_id","ml_user_id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_product_id" TEXT,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "image_url" TEXT,
    "primary_ml_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "location" "StockLocation" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "source_type" "StockMovementSource" NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_line_key" TEXT NOT NULL DEFAULT '',
    "listing_ml_item_id" TEXT,
    "channel" TEXT,
    "shipment_id" TEXT,
    "node_id" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "created_by_ml_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "stock_item_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "own_qty" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("stock_item_id")
);

-- CreateTable
CREATE TABLE "stock_item_ml_positions" (
    "stock_item_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "deposit_qty" INTEGER,
    "full_available_qty" INTEGER,
    "full_transfer_qty" INTEGER,
    "full_other_qty" INTEGER,
    "full_total_qty" INTEGER,
    "full_baseline_qty" INTEGER,
    "full_baseline_at" TIMESTAMP(3),
    "fetched_at" TIMESTAMP(3),
    "error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_item_ml_positions_pkey" PRIMARY KEY ("stock_item_id")
);

-- CreateTable
CREATE TABLE "stock_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "arrived_at" TIMESTAMP(3) NOT NULL,
    "supplier_id" TEXT,
    "invoice_number" TEXT,
    "notes" TEXT,
    "status" "StockEntryStatus" NOT NULL DEFAULT 'active',
    "reversed_at" TIMESTAMP(3),
    "created_by_ml_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "entry_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "consumed_qty" INTEGER NOT NULL DEFAULT 0,
    "status" "StockLotStatus" NOT NULL DEFAULT 'queued',
    "activated_at" TIMESTAMP(3),
    "depleted_at" TIMESTAMP(3),
    "cost_known" BOOLEAN NOT NULL DEFAULT true,
    "unit_cost_nf" DECIMAL(18,2) NOT NULL,
    "purchase_icms_percent" DECIMAL(8,4) NOT NULL,
    "has_icms_st" BOOLEAN NOT NULL DEFAULT false,
    "purchase_cost_with_st" DECIMAL(18,2),
    "ipi_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "extra_costs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lot_consumptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_lot_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_review_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "StockReviewKind" NOT NULL,
    "status" "StockReviewStatus" NOT NULL DEFAULT 'open',
    "source_key" TEXT NOT NULL,
    "stock_item_id" TEXT,
    "listing_ml_item_id" TEXT,
    "order_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "resolution" TEXT,
    "resolved_quantity" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_ml_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_sync_state_last_orders_sync_at_idx" ON "stock_sync_state"("last_orders_sync_at");

-- CreateIndex
CREATE INDEX "stock_items_organization_id_idx" ON "stock_items"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_organization_id_user_product_id_key" ON "stock_items"("organization_id", "user_product_id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_stock_item_id_occurred_at_idx" ON "stock_movements"("organization_id", "stock_item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_occurred_at_idx" ON "stock_movements"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_location_occurred_at_idx" ON "stock_movements"("organization_id", "location", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_organization_id_source_type_source_id_sourc_key" ON "stock_movements"("organization_id", "source_type", "source_id", "source_line_key", "stock_item_id", "type");

-- CreateIndex
CREATE INDEX "stock_balances_organization_id_idx" ON "stock_balances"("organization_id");

-- CreateIndex
CREATE INDEX "stock_item_ml_positions_organization_id_idx" ON "stock_item_ml_positions"("organization_id");

-- CreateIndex
CREATE INDEX "stock_entries_organization_id_arrived_at_idx" ON "stock_entries"("organization_id", "arrived_at");

-- CreateIndex
CREATE INDEX "stock_lots_organization_id_stock_item_id_received_at_idx" ON "stock_lots"("organization_id", "stock_item_id", "received_at");

-- CreateIndex
CREATE INDEX "stock_lots_entry_id_idx" ON "stock_lots"("entry_id");

-- CreateIndex
CREATE INDEX "stock_lot_consumptions_organization_id_idx" ON "stock_lot_consumptions"("organization_id");

-- CreateIndex
CREATE INDEX "stock_lot_consumptions_movement_id_idx" ON "stock_lot_consumptions"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_lot_consumptions_lot_id_movement_id_key" ON "stock_lot_consumptions"("lot_id", "movement_id");

-- CreateIndex
CREATE INDEX "stock_review_items_organization_id_status_idx" ON "stock_review_items"("organization_id", "status");

-- CreateIndex
CREATE INDEX "stock_review_items_organization_id_stock_item_id_idx" ON "stock_review_items"("organization_id", "stock_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_review_items_organization_id_kind_source_key_key" ON "stock_review_items"("organization_id", "kind", "source_key");

-- CreateIndex
CREATE INDEX "listings_organization_id_user_product_id_idx" ON "listings"("organization_id", "user_product_id");

-- CreateIndex
CREATE INDEX "listings_stock_item_id_idx" ON "listings"("stock_item_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_item_ml_positions" ADD CONSTRAINT "stock_item_ml_positions_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "stock_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lot_consumptions" ADD CONSTRAINT "stock_lot_consumptions_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

