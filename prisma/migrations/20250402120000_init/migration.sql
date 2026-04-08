-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "listings" (
    "ml_item_id" TEXT NOT NULL,
    "title_snapshot" TEXT,
    "catalog_listing" BOOLEAN,
    "last_synced_at" TIMESTAMP(3),
    "active_on_ml" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("ml_item_id")
);

-- CreateTable
CREATE TABLE "warehouse_stock" (
    "ml_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_stock_pkey" PRIMARY KEY ("ml_item_id")
);

-- CreateIndex
CREATE INDEX "listings_active_on_ml_idx" ON "listings"("active_on_ml");

-- AddForeignKey
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_ml_item_id_fkey" FOREIGN KEY ("ml_item_id") REFERENCES "listings"("ml_item_id") ON DELETE CASCADE ON UPDATE CASCADE;
