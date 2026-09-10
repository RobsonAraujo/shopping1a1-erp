-- AlterTable
ALTER TABLE "replenishment_cycles" ADD COLUMN     "column_id" TEXT;

-- CreateTable
CREATE TABLE "kanban_columns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "OperationCycleKind" NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_columns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kanban_columns_organization_id_kind_idx" ON "kanban_columns"("organization_id", "kind");

-- CreateIndex
CREATE INDEX "replenishment_cycles_column_id_idx" ON "replenishment_cycles"("column_id");

-- AddForeignKey
ALTER TABLE "replenishment_cycles" ADD CONSTRAINT "replenishment_cycles_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "kanban_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
