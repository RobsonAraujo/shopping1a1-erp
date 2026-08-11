-- CreateTable
CREATE TABLE "dre_product_cost_levelings" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "start_year" INTEGER NOT NULL,
    "start_month" INTEGER NOT NULL,
    "end_year" INTEGER NOT NULL,
    "end_month" INTEGER NOT NULL,
    "has_icms_st" BOOLEAN NOT NULL DEFAULT false,
    "unit_cost_nf" DECIMAL(18,2) NOT NULL,
    "purchase_cost_with_st" DECIMAL(18,2),
    "ipi_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dre_product_cost_levelings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dre_product_cost_levelings_sku_idx" ON "dre_product_cost_levelings"("sku");

-- CreateIndex
CREATE INDEX "dre_product_cost_levelings_start_year_start_month_end_year_end_month_idx" ON "dre_product_cost_levelings"("start_year", "start_month", "end_year", "end_month");

-- AddForeignKey
ALTER TABLE "dre_product_cost_levelings" ADD CONSTRAINT "dre_product_cost_levelings_sku_fkey" FOREIGN KEY ("sku") REFERENCES "products"("sku") ON DELETE CASCADE ON UPDATE CASCADE;
