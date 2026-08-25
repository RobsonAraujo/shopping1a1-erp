-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DreCostSection" ADD VALUE 'non_operational_out';
ALTER TYPE "DreCostSection" ADD VALUE 'non_operational_in';

-- CreateTable
CREATE TABLE "dre_display_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "show_investments" BOOLEAN NOT NULL DEFAULT true,
    "show_non_operational_out" BOOLEAN NOT NULL DEFAULT true,
    "show_non_operational_in" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dre_display_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dre_display_settings_organization_id_key" ON "dre_display_settings"("organization_id");
