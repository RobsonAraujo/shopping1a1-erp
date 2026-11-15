-- Rotina: última venda na janela lida pelo Atualizar (sem consulta extra ao abrir a página).
ALTER TABLE "listing_health" ADD COLUMN "last_sale_at" TIMESTAMP(3);
ALTER TABLE "listing_health" ADD COLUMN "sales_window_days" INTEGER;

-- Cache de vendas: data da venda mais recente na mesma varredura.
ALTER TABLE "sales_window_snapshots" ADD COLUMN "last_sale_at" TIMESTAMP(3);
