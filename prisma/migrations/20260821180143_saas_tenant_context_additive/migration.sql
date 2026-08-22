-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled');

-- AlterTable
ALTER TABLE "catalog_competition_poll_runs" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "catalog_competition_snapshots" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "company_tax_settings" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "dre_cost_items" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "dre_cost_month_values" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "dre_month_snapshots" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "dre_product_cost_levelings" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "full_shipments" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "kit_items" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "kits" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "product_sku_aliases" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "replenishment_cycles" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "revenue_simulations" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "stock_attention_acknowledgements" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "tax_fixed_cost_items" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "tax_fixed_cost_month_exclusions" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "tax_fixed_cost_month_values" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "tax_report_month_snapshots" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "warehouse_stock" ADD COLUMN     "organization_id" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'trialing',
    "status_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateTable
CREATE TABLE "organization_ml_sellers" (
    "organization_id" TEXT NOT NULL,
    "ml_user_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_ml_sellers_pkey" PRIMARY KEY ("organization_id","ml_user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organization_ml_sellers_ml_user_id_key" ON "organization_ml_sellers"("ml_user_id");

-- CreateIndex
CREATE INDEX "catalog_competition_poll_runs_organization_id_idx" ON "catalog_competition_poll_runs"("organization_id");

-- CreateIndex
CREATE INDEX "catalog_competition_snapshots_organization_id_idx" ON "catalog_competition_snapshots"("organization_id");

-- CreateIndex
CREATE INDEX "company_tax_settings_organization_id_idx" ON "company_tax_settings"("organization_id");

-- CreateIndex
CREATE INDEX "dre_cost_items_organization_id_idx" ON "dre_cost_items"("organization_id");

-- CreateIndex
CREATE INDEX "dre_cost_month_values_organization_id_idx" ON "dre_cost_month_values"("organization_id");

-- CreateIndex
CREATE INDEX "dre_month_snapshots_organization_id_idx" ON "dre_month_snapshots"("organization_id");

-- CreateIndex
CREATE INDEX "dre_product_cost_levelings_organization_id_idx" ON "dre_product_cost_levelings"("organization_id");

-- CreateIndex
CREATE INDEX "full_shipments_organization_id_idx" ON "full_shipments"("organization_id");

-- CreateIndex
CREATE INDEX "kit_items_organization_id_idx" ON "kit_items"("organization_id");

-- CreateIndex
CREATE INDEX "kits_organization_id_idx" ON "kits"("organization_id");

-- CreateIndex
CREATE INDEX "listings_organization_id_idx" ON "listings"("organization_id");

-- CreateIndex
CREATE INDEX "product_sku_aliases_organization_id_idx" ON "product_sku_aliases"("organization_id");

-- CreateIndex
CREATE INDEX "products_organization_id_idx" ON "products"("organization_id");

-- CreateIndex
CREATE INDEX "replenishment_cycles_organization_id_idx" ON "replenishment_cycles"("organization_id");

-- CreateIndex
CREATE INDEX "revenue_simulations_organization_id_idx" ON "revenue_simulations"("organization_id");

-- CreateIndex
CREATE INDEX "stock_attention_acknowledgements_organization_id_idx" ON "stock_attention_acknowledgements"("organization_id");

-- CreateIndex
CREATE INDEX "tax_fixed_cost_items_organization_id_idx" ON "tax_fixed_cost_items"("organization_id");

-- CreateIndex
CREATE INDEX "tax_fixed_cost_month_exclusions_organization_id_idx" ON "tax_fixed_cost_month_exclusions"("organization_id");

-- CreateIndex
CREATE INDEX "tax_fixed_cost_month_values_organization_id_idx" ON "tax_fixed_cost_month_values"("organization_id");

-- CreateIndex
CREATE INDEX "tax_report_month_snapshots_organization_id_idx" ON "tax_report_month_snapshots"("organization_id");

-- CreateIndex
CREATE INDEX "warehouse_stock_organization_id_idx" ON "warehouse_stock"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ml_sellers" ADD CONSTRAINT "organization_ml_sellers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
