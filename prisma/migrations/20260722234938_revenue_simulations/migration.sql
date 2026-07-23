-- CreateTable
CREATE TABLE "revenue_simulations" (
    "id" TEXT NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revenue_simulations_seller_id_idx" ON "revenue_simulations"("seller_id");
