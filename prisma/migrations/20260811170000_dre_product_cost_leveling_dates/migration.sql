-- Convert month-based leveling periods to inclusive calendar dates.
ALTER TABLE "dre_product_cost_levelings" ADD COLUMN "start_date" DATE;
ALTER TABLE "dre_product_cost_levelings" ADD COLUMN "end_date" DATE;

UPDATE "dre_product_cost_levelings"
SET
  "start_date" = make_date("start_year", "start_month", 1),
  "end_date" = (
    make_date("end_year", "end_month", 1) + INTERVAL '1 month' - INTERVAL '1 day'
  )::date;

ALTER TABLE "dre_product_cost_levelings" ALTER COLUMN "start_date" SET NOT NULL;
ALTER TABLE "dre_product_cost_levelings" ALTER COLUMN "end_date" SET NOT NULL;

DROP INDEX IF EXISTS "dre_product_cost_levelings_start_year_start_month_end_year_end_month_idx";

ALTER TABLE "dre_product_cost_levelings" DROP COLUMN "start_year";
ALTER TABLE "dre_product_cost_levelings" DROP COLUMN "start_month";
ALTER TABLE "dre_product_cost_levelings" DROP COLUMN "end_year";
ALTER TABLE "dre_product_cost_levelings" DROP COLUMN "end_month";

CREATE INDEX "dre_product_cost_levelings_start_date_end_date_idx" ON "dre_product_cost_levelings"("start_date", "end_date");
