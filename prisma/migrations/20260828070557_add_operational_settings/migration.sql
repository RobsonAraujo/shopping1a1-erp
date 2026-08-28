-- CreateTable
CREATE TABLE "operational_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sales_average_window_days" INTEGER,
    "lead_time_days" INTEGER,
    "active_stock_buffer_days" INTEGER,
    "target_coverage_buffer_days" INTEGER,
    "rotation_high_daily_avg" INTEGER,
    "rotation_medium_daily_avg" INTEGER,
    "promotion_expiring_soon_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operational_settings_organization_id_key" ON "operational_settings"("organization_id");
