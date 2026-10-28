-- Receita e imposto operacional por dia × anúncio, gravados junto com o
-- snapshot do Tributário. O imposto "últimos 30 dias" (Produtos/Lucratividade)
-- é somado no Postgres a partir desta coluna, sem trafegar o payload por venda.
-- Nullable: backfill roda separado (scripts/backfill-tax-daily-totals.ts).
ALTER TABLE "tax_report_month_snapshots" ADD COLUMN "daily_totals" JSONB;
