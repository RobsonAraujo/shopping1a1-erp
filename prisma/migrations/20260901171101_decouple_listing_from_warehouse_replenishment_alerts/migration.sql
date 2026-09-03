-- DropForeignKey
ALTER TABLE "replenishment_cycles" DROP CONSTRAINT "replenishment_cycles_ml_item_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_attention_acknowledgements" DROP CONSTRAINT "stock_attention_acknowledgements_ml_item_id_fkey";

-- DropForeignKey
ALTER TABLE "warehouse_stock" DROP CONSTRAINT "warehouse_stock_ml_item_id_fkey";
