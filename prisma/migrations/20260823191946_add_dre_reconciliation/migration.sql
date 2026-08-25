-- CreateEnum
CREATE TYPE "DreReconciliationImportStatus" AS ENUM ('pending', 'confirmed', 'superseded');

-- CreateTable
CREATE TABLE "dre_reconciliation_imports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "status" "DreReconciliationImportStatus" NOT NULL DEFAULT 'pending',
    "aggregation_json" JSONB NOT NULL,
    "parse_warnings_json" JSONB,
    "previous_payload_json" JSONB,
    "accepted_line_keys_json" JSONB,
    "applied_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dre_reconciliation_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dre_reconciliation_entries" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "operation_date" DATE,
    "operation_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "operation_status" TEXT,
    "sku" TEXT,
    "item_title" TEXT,
    "quantity" INTEGER,
    "gross_value" DECIMAL(18,2),
    "total_fees" DECIMAL(18,2),
    "total_postpaid_fees" DECIMAL(18,2),
    "seller_paid_shipping" DECIMAL(18,2),
    "mapped_line_key" TEXT,
    "mapped_amount" DECIMAL(18,2),
    "raw_json" JSONB NOT NULL,

    CONSTRAINT "dre_reconciliation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dre_reconciliation_imports_organization_id_year_month_statu_idx" ON "dre_reconciliation_imports"("organization_id", "year", "month", "status");

-- CreateIndex
CREATE INDEX "dre_reconciliation_entries_organization_id_import_id_idx" ON "dre_reconciliation_entries"("organization_id", "import_id");

-- CreateIndex
CREATE INDEX "dre_reconciliation_entries_import_id_mapped_line_key_idx" ON "dre_reconciliation_entries"("import_id", "mapped_line_key");

-- AddForeignKey
ALTER TABLE "dre_reconciliation_entries" ADD CONSTRAINT "dre_reconciliation_entries_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "dre_reconciliation_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
