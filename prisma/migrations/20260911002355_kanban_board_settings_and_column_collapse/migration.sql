-- AlterTable
ALTER TABLE "kanban_columns" ADD COLUMN     "is_collapsed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "kanban_board_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "OperationCycleKind" NOT NULL,
    "background" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_board_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kanban_board_settings_organization_id_kind_key" ON "kanban_board_settings"("organization_id", "kind");
