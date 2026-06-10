-- AlterEnum
ALTER TYPE "CatalogCompetitionSource" ADD VALUE 'cron';

-- AlterTable listings
ALTER TABLE "listings" ADD COLUMN "catalog_status" "CatalogCompetitionStatus",
ADD COLUMN "catalog_seller_price" DECIMAL(18,2),
ADD COLUMN "catalog_price_to_win" DECIMAL(18,2),
ADD COLUMN "catalog_polled_at" TIMESTAMP(3);

-- AlterTable catalog_competition_snapshots
ALTER TABLE "catalog_competition_snapshots" ADD COLUMN "seller_price" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "catalog_competition_poll_runs" (
    "id" TEXT NOT NULL,
    "ran_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "CatalogCompetitionSource" NOT NULL,
    "items_checked" INTEGER NOT NULL DEFAULT 0,
    "items_changed" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error_summary" TEXT,

    CONSTRAINT "catalog_competition_poll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_competition_poll_runs_ran_at_idx" ON "catalog_competition_poll_runs"("ran_at" DESC);
