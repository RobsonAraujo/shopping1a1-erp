-- AlterTable
ALTER TABLE "inventory_stock_month_snapshots" ADD COLUMN     "inventory_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
