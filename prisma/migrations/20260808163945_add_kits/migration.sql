-- CreateTable
CREATE TABLE "kits" (
    "ml_item_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kits_pkey" PRIMARY KEY ("ml_item_id")
);

-- CreateTable
CREATE TABLE "kit_items" (
    "kit_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,

    CONSTRAINT "kit_items_pkey" PRIMARY KEY ("kit_id","sku")
);

-- CreateIndex
CREATE INDEX "kit_items_sku_idx" ON "kit_items"("sku");

-- AddForeignKey
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "kits"("ml_item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_sku_fkey" FOREIGN KEY ("sku") REFERENCES "products"("sku") ON DELETE CASCADE ON UPDATE CASCADE;
