-- CreateTable
CREATE TABLE "dre_cost_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dre_cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dre_cost_month_values" (
    "id" TEXT NOT NULL,
    "cost_item_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "dre_cost_month_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dre_month_snapshots" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "dre_month_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dre_cost_month_values_year_month_idx" ON "dre_cost_month_values"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "dre_cost_month_values_cost_item_id_year_month_key" ON "dre_cost_month_values"("cost_item_id", "year", "month");

-- CreateIndex
CREATE INDEX "dre_month_snapshots_year_month_idx" ON "dre_month_snapshots"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "dre_month_snapshots_year_month_key" ON "dre_month_snapshots"("year", "month");

-- AddForeignKey
ALTER TABLE "dre_cost_month_values" ADD CONSTRAINT "dre_cost_month_values_cost_item_id_fkey" FOREIGN KEY ("cost_item_id") REFERENCES "dre_cost_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
