-- Estoque automático: retirada do Full (mercadoria voltando para casa) e
-- unidades perdidas pelo ML fora do total. Só aditiva.

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'full_return';

-- AlterEnum
ALTER TYPE "StockReviewKind" ADD VALUE 'full_withdrawal';

-- AlterTable
ALTER TABLE "stock_item_ml_positions" ADD COLUMN "full_withdrawal_qty" INTEGER,
ADD COLUMN "full_lost_qty" INTEGER;
