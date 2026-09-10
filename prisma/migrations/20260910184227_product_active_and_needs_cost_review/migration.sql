-- AlterTable
ALTER TABLE "products" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "needs_cost_review" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "products_organization_id_active_idx" ON "products"("organization_id", "active");
