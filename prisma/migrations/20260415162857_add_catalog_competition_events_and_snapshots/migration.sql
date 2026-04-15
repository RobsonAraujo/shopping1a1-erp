-- CreateEnum
CREATE TYPE "CatalogCompetitionStatus" AS ENUM ('winning', 'losing', 'shared', 'unknown');

-- CreateEnum
CREATE TYPE "CatalogCompetitionSource" AS ENUM ('webhook', 'missed_feed', 'manual_poll');

-- CreateTable
CREATE TABLE "catalog_competition_events" (
    "id" TEXT NOT NULL,
    "ml_item_id" TEXT NOT NULL,
    "status" "CatalogCompetitionStatus" NOT NULL,
    "source" "CatalogCompetitionSource" NOT NULL DEFAULT 'webhook',
    "event_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload" JSONB NOT NULL,

    CONSTRAINT "catalog_competition_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_competition_snapshots" (
    "id" TEXT NOT NULL,
    "ml_item_id" TEXT NOT NULL,
    "status" "CatalogCompetitionStatus" NOT NULL,
    "price_to_win" DECIMAL(18,2),
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "CatalogCompetitionSource" NOT NULL DEFAULT 'manual_poll',
    "raw_response" JSONB NOT NULL,

    CONSTRAINT "catalog_competition_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_competition_events_ml_item_id_event_at_idx" ON "catalog_competition_events"("ml_item_id", "event_at" DESC);

-- CreateIndex
CREATE INDEX "catalog_competition_events_event_at_idx" ON "catalog_competition_events"("event_at" DESC);

-- CreateIndex
CREATE INDEX "catalog_competition_snapshots_snapshot_at_idx" ON "catalog_competition_snapshots"("snapshot_at" DESC);

-- CreateIndex
CREATE INDEX "catalog_competition_snapshots_ml_item_id_snapshot_at_idx" ON "catalog_competition_snapshots"("ml_item_id", "snapshot_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_competition_snapshots_ml_item_id_snapshot_at_key" ON "catalog_competition_snapshots"("ml_item_id", "snapshot_at");

-- AddForeignKey
ALTER TABLE "catalog_competition_events" ADD CONSTRAINT "catalog_competition_events_ml_item_id_fkey" FOREIGN KEY ("ml_item_id") REFERENCES "listings"("ml_item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_competition_snapshots" ADD CONSTRAINT "catalog_competition_snapshots_ml_item_id_fkey" FOREIGN KEY ("ml_item_id") REFERENCES "listings"("ml_item_id") ON DELETE CASCADE ON UPDATE CASCADE;
