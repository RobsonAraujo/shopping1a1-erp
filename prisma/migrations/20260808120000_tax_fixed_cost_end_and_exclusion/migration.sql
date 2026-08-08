-- AlterTable
ALTER TABLE "tax_fixed_cost_items" ADD COLUMN "end_year" INTEGER;
ALTER TABLE "tax_fixed_cost_items" ADD COLUMN "end_month" INTEGER;

-- CreateTable
CREATE TABLE "tax_fixed_cost_month_exclusions" (
    "id" TEXT NOT NULL,
    "cost_item_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,

    CONSTRAINT "tax_fixed_cost_month_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_fixed_cost_month_exclusions_year_month_idx" ON "tax_fixed_cost_month_exclusions"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "tax_fixed_cost_month_exclusions_cost_item_id_year_month_key" ON "tax_fixed_cost_month_exclusions"("cost_item_id", "year", "month");

-- AddForeignKey
ALTER TABLE "tax_fixed_cost_month_exclusions" ADD CONSTRAINT "tax_fixed_cost_month_exclusions_cost_item_id_fkey" FOREIGN KEY ("cost_item_id") REFERENCES "tax_fixed_cost_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
