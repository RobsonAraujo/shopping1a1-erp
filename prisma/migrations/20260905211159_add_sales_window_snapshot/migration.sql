-- CreateTable
CREATE TABLE "sales_window_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ml_item_id" TEXT NOT NULL,
    "window_days" INTEGER NOT NULL,
    "date_field" TEXT NOT NULL,
    "units_sold" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_window_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_window_snapshots_organization_id_idx" ON "sales_window_snapshots"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_window_snapshots_organization_id_ml_item_id_window_da_key" ON "sales_window_snapshots"("organization_id", "ml_item_id", "window_days", "date_field");
