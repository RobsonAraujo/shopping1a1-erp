-- CreateTable
CREATE TABLE "tax_report_simulation_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "scenario" TEXT NOT NULL DEFAULT 'LUCRO_REAL',
    "generated_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_summary" JSONB,

    CONSTRAINT "tax_report_simulation_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_report_simulation_snapshots_organization_id_idx" ON "tax_report_simulation_snapshots"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_report_simulation_snapshots_organization_id_seller_id_y_key" ON "tax_report_simulation_snapshots"("organization_id", "seller_id", "year", "month", "scenario");
