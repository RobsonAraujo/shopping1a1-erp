-- CreateEnum
CREATE TYPE "StockAttentionKind" AS ENUM ('full', 'purchase');

-- CreateTable
CREATE TABLE "stock_attention_acknowledgements" (
    "id" TEXT NOT NULL,
    "ml_item_id" TEXT NOT NULL,
    "kind" "StockAttentionKind" NOT NULL,
    "ml_available_quantity" INTEGER NOT NULL,
    "warehouse_quantity" INTEGER NOT NULL,
    "purchase_lead_time_days" INTEGER,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_attention_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_attention_acknowledgements_kind_idx" ON "stock_attention_acknowledgements"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "stock_attention_acknowledgements_ml_item_id_kind_key" ON "stock_attention_acknowledgements"("ml_item_id", "kind");

-- AddForeignKey
ALTER TABLE "stock_attention_acknowledgements" ADD CONSTRAINT "stock_attention_acknowledgements_ml_item_id_fkey" FOREIGN KEY ("ml_item_id") REFERENCES "listings"("ml_item_id") ON DELETE CASCADE ON UPDATE CASCADE;
