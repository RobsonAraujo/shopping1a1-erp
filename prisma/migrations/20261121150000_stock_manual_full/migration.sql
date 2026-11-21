-- Estoque: o envio ao Full e a volta do Full passam a ser registrados à mão
-- (sem detecção automática nem cron). Remove a base da detecção e os tipos
-- de pendência do Full. Nenhuma linha usa esses tipos (a detecção nunca foi
-- para produção); o DELETE só garante a troca do enum.

DELETE FROM "stock_review_items" WHERE "kind"::text IN ('full_inbound', 'full_withdrawal');

-- AlterEnum
BEGIN;
CREATE TYPE "StockReviewKind_new" AS ENUM ('unmapped_sale', 'return_to_check');
ALTER TABLE "stock_review_items" ALTER COLUMN "kind" TYPE "StockReviewKind_new" USING ("kind"::text::"StockReviewKind_new");
ALTER TYPE "StockReviewKind" RENAME TO "StockReviewKind_old";
ALTER TYPE "StockReviewKind_new" RENAME TO "StockReviewKind";
DROP TYPE "public"."StockReviewKind_old";
COMMIT;

-- AlterTable
ALTER TABLE "stock_item_ml_positions" DROP COLUMN "full_baseline_at",
DROP COLUMN "full_baseline_qty";
