-- Cole aqui o SQL exportado do Supabase (qualquer tabela).
-- Depois rode: npm run seed:sql
-- Upsert opcional: npm run seed:sql -- --conflict=sku
--   (troque sku pela PK / unique da tabela, ex.: --conflict=id)

INSERT INTO "public"."product_sku_aliases" ("alias_sku", "canonical_sku", "created_at") VALUES ('Arouca - Fechadura 2010-ZC (Catálogo)', 'Arouca - Cilindro 2010-ZC (Catálogo)', '2026-08-05 15:32:24.691'), ('Arouca - Fechadura 2192b (Catálogo 1)', 'Arouca - Fechadura 2189B (Catálogo 1)', '2026-08-05 15:32:45.804'), ('Arouca Fechadura 2192b (Catálogo 2)', 'Arouca - Fechadura 2189B (Catálogo 2)', '2026-08-05 15:33:04.359'), ('MXT - Cabo Guitar 10m (Próprio)', 'MXT - Cabo 81063 10m (Próprio)', '2026-06-20 21:20:38.593'), ('Tecniforte - Kit 2 Gorila 3,05m (Próprio)', 'Tecniforte - Kit 2 Gorilla 3,05m (Próprio)', '2026-06-30 19:36:30.101');
