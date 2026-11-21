-- Quebra do Full por status do ML (em transferência, retirada, sem cobertura fiscal…), para a tela nomear cada parte.
ALTER TABLE "stock_item_ml_positions" ADD COLUMN "full_unavailable_detail" JSONB;
