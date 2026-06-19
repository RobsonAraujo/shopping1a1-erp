-- CreateTable
CREATE TABLE "product_sku_aliases" (
  "alias_sku" TEXT NOT NULL,
  "canonical_sku" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_sku_aliases_pkey" PRIMARY KEY ("alias_sku")
);

-- CreateIndex
CREATE INDEX "product_sku_aliases_canonical_sku_idx" ON "product_sku_aliases"("canonical_sku");

-- AddForeignKey
ALTER TABLE "product_sku_aliases" ADD CONSTRAINT "product_sku_aliases_canonical_sku_fkey" FOREIGN KEY ("canonical_sku") REFERENCES "products"("sku") ON DELETE CASCADE ON UPDATE CASCADE;
