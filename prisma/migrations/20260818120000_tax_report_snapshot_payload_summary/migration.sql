-- Coluna resumida (sem porSku[].transacoes) para leituras "ao vivo" que só
-- precisam de agregados por SKU (Produtos, DRE, Avaliação Financeira),
-- evitando trafegar o detalhamento por venda (memoriaCalculo/breakdowns) do
-- Postgres a cada requisição. Nullable: backfill roda separado, em batch.
ALTER TABLE "tax_report_month_snapshots" ADD COLUMN "payload_summary" JSONB;
