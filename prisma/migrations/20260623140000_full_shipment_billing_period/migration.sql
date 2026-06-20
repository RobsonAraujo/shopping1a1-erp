-- AlterTable
ALTER TABLE "full_shipments" ADD COLUMN "billing_year" INTEGER;
ALTER TABLE "full_shipments" ADD COLUMN "billing_month" INTEGER;

-- CreateIndex
CREATE INDEX "full_shipments_billing_year_billing_month_idx" ON "full_shipments"("billing_year", "billing_month");
