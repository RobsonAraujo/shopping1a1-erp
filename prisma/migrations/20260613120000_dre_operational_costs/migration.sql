-- DRE: custos operacionais manuais + linhas Full no snapshot
CREATE TYPE "DreCostSection" AS ENUM ('fixed', 'operational');

ALTER TABLE "dre_cost_items"
ADD COLUMN "section" "DreCostSection" NOT NULL DEFAULT 'fixed';

CREATE INDEX "dre_cost_items_section_active_idx"
ON "dre_cost_items"("section", "active");
