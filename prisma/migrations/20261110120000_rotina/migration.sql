-- CreateEnum
CREATE TYPE "ListingActionStatus" AS ENUM ('open', 'done', 'snoozed', 'dismissed', 'resolved');

-- CreateEnum
CREATE TYPE "ListingHealthRunStatus" AS ENUM ('running', 'ok', 'partial', 'failed');

-- AlterTable
ALTER TABLE "operational_settings" ADD COLUMN     "rotina_catalog_min_margin_percent" DECIMAL(6,2),
ADD COLUMN     "rotina_disabled_rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rotina_own_min_margin_percent" DECIMAL(6,2),
ADD COLUMN     "rotina_own_tacos_target_percent" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "listing_targets" (
    "ml_item_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "min_margin_percent" DECIMAL(6,2),
    "tacos_target_percent" DECIMAL(6,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_targets_pkey" PRIMARY KEY ("ml_item_id")
);

-- CreateTable
CREATE TABLE "listing_health" (
    "ml_item_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "image_url" TEXT,
    "permalink" TEXT NOT NULL,
    "catalog_listing" BOOLEAN NOT NULL,
    "ml_status" TEXT NOT NULL,
    "sale_price" DECIMAL(18,2) NOT NULL,
    "regular_price" DECIMAL(18,2),
    "promotion_known" BOOLEAN NOT NULL,
    "has_promotion" BOOLEAN NOT NULL,
    "promotion_name" TEXT,
    "promotion_type" TEXT,
    "promotion_ends_at" TIMESTAMP(3),
    "promotion_end_known" BOOLEAN NOT NULL DEFAULT true,
    "margin_percent" DECIMAL(9,2),
    "margin_value" DECIMAL(18,2),
    "margin_after_ads_percent" DECIMAL(9,2),
    "margin_after_ads_value" DECIMAL(18,2),
    "exclusion_reason" TEXT,
    "floor_target_percent" DECIMAL(6,2),
    "floor_mc_price" DECIMAL(18,2),
    "floor_after_ads_price" DECIMAL(18,2),
    "floor_reason" TEXT,
    "floor_refined" BOOLEAN NOT NULL DEFAULT false,
    "floor_bands" JSONB,
    "pma_price" DECIMAL(18,2),
    "units_per_day" DECIMAL(12,3),
    "ads_available" BOOLEAN NOT NULL,
    "ads_status" TEXT,
    "ads_cost" DECIMAL(18,2),
    "tacos_percent" DECIMAL(9,2),
    "ads_period_days" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "catalog_product_id" TEXT,
    "related_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linked_own_item_id" TEXT,
    "listed_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_health_pkey" PRIMARY KEY ("ml_item_id")
);

-- CreateTable
CREATE TABLE "listing_action_states" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ml_item_id" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "status" "ListingActionStatus" NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "status_changed_at" TIMESTAMP(3) NOT NULL,
    "snoozed_until" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "related_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_action_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_health_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "ListingHealthRunStatus" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "is_baseline" BOOLEAN NOT NULL DEFAULT false,
    "planned_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "items_total" INTEGER NOT NULL DEFAULT 0,
    "items_done" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "warnings" JSONB,
    "error_summary" TEXT,

    CONSTRAINT "listing_health_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_targets_organization_id_idx" ON "listing_targets"("organization_id");

-- CreateIndex
CREATE INDEX "listing_health_organization_id_idx" ON "listing_health"("organization_id");

-- CreateIndex
CREATE INDEX "listing_action_states_organization_id_status_idx" ON "listing_action_states"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_action_states_organization_id_ml_item_id_rule_key" ON "listing_action_states"("organization_id", "ml_item_id", "rule");

-- CreateIndex
CREATE INDEX "listing_health_runs_organization_id_started_at_idx" ON "listing_health_runs"("organization_id", "started_at" DESC);
