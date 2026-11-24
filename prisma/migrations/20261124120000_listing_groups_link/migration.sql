-- Opções de venda: rodada de vínculo dos anúncios (UP + item de estoque) por seller.
ALTER TABLE "organization_ml_sellers" ADD COLUMN "last_listings_linked_at" TIMESTAMP(3);
