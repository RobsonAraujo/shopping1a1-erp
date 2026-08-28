-- CreateTable
CREATE TABLE "simples_revenue_month_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,
    "source" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simples_revenue_month_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simples_revenue_month_snapshots_organization_id_idx" ON "simples_revenue_month_snapshots"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "simples_revenue_month_snapshots_organization_id_seller_id_y_key" ON "simples_revenue_month_snapshots"("organization_id", "seller_id", "year", "month");
