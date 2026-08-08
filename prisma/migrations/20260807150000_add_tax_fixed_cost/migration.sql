-- CreateTable
CREATE TABLE "tax_fixed_cost_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_fixed_cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_fixed_cost_month_values" (
    "id" TEXT NOT NULL,
    "cost_item_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "tax_fixed_cost_month_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_fixed_cost_items_active_idx" ON "tax_fixed_cost_items"("active");

-- CreateIndex
CREATE INDEX "tax_fixed_cost_month_values_year_month_idx" ON "tax_fixed_cost_month_values"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "tax_fixed_cost_month_values_cost_item_id_year_month_key" ON "tax_fixed_cost_month_values"("cost_item_id", "year", "month");

-- AddForeignKey
ALTER TABLE "tax_fixed_cost_month_values" ADD CONSTRAINT "tax_fixed_cost_month_values_cost_item_id_fkey" FOREIGN KEY ("cost_item_id") REFERENCES "tax_fixed_cost_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
