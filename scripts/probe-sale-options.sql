-- Fase 0 das opções de venda: conferência SOMENTE LEITURA para produção.
--
-- Opção de venda = MLBs diferentes (Clássico, Premium, B2B…) com o mesmo
-- `user_product_id` (UP), o mesmo SKU e o mesmo estoque.
--
-- Uso:
--   psql "$DATABASE_URL" -f scripts/probe-sale-options.sql
--
-- Tudo roda numa transação READ ONLY desfeita no fim: nada é gravado.

BEGIN TRANSACTION READ ONLY;

\echo '== 0. Organizações (e se ativaram o Estoque)'
SELECT o.id AS organization_id, o.name,
       (ss.organization_id IS NOT NULL) AS estoque_ativado,
       (SELECT count(*) FROM listings l WHERE l.organization_id = o.id) AS anuncios,
       (SELECT count(*) FROM listings l WHERE l.organization_id = o.id AND l.user_product_id IS NULL) AS anuncios_sem_up,
       (SELECT count(*) FROM products p WHERE p.organization_id = o.id) AS cadastros
FROM organizations o
LEFT JOIN stock_settings ss ON ss.organization_id = o.id
ORDER BY anuncios DESC;

\echo '== 1. Produtos físicos com mais de uma opção de venda'
WITH grupos AS (
  SELECT organization_id, user_product_id, count(*) AS opcoes
  FROM listings
  WHERE user_product_id IS NOT NULL
  GROUP BY 1, 2
  HAVING count(*) > 1
)
SELECT g.organization_id, count(*) AS produtos_com_opcoes, sum(g.opcoes) AS anuncios
FROM grupos g
GROUP BY 1
ORDER BY 2 DESC;

\echo '== 2. Produtos com mais de um cadastro (um por opção) — os avisos de "cadastro duplicado"'
WITH cadastros AS (
  SELECT l.organization_id, l.user_product_id, p.ml_item_id, p.needs_cost_review, p.unit_cost_nf
  FROM listings l
  JOIN products p ON p.ml_item_id = l.ml_item_id
  WHERE l.user_product_id IS NOT NULL
),
grupos AS (
  SELECT organization_id, user_product_id,
         count(*) AS cadastros,
         count(*) FILTER (WHERE needs_cost_review) AS pendentes,
         count(DISTINCT unit_cost_nf) FILTER (WHERE NOT needs_cost_review) AS custos_distintos
  FROM cadastros
  GROUP BY 1, 2
  HAVING count(*) > 1
)
SELECT organization_id,
       count(*) AS produtos,
       sum(cadastros) - count(*) AS cadastros_de_opcao,
       sum(pendentes) AS cadastros_pendentes_no_grupo,
       count(*) FILTER (WHERE custos_distintos > 1) AS produtos_com_custos_diferentes
FROM grupos
GROUP BY 1
ORDER BY 2 DESC;

\echo '== 3. Opções sem cadastro cujo SKU do anúncio difere do SKU do cadastro da outra opção (vendas que hoje ficam sem custo)'
SELECT o.organization_id, o.user_product_id, o.ml_item_id AS opcao, o.listing_type_id,
       o.sku_snapshot AS sku_anuncio, p.ml_item_id AS cadastrado, p.sku AS sku_cadastro
FROM listings o
JOIN listings s
  ON s.organization_id = o.organization_id
 AND s.user_product_id = o.user_product_id
 AND s.ml_item_id <> o.ml_item_id
JOIN products p ON p.ml_item_id = s.ml_item_id AND NOT p.needs_cost_review
WHERE o.user_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM products po WHERE po.ml_item_id = o.ml_item_id)
  AND btrim(regexp_replace(coalesce(p.sku, ''), '\s+', ' ', 'g'))
      IS DISTINCT FROM btrim(regexp_replace(coalesce(o.sku_snapshot, ''), '\s+', ' ', 'g'))
ORDER BY 1, 2;

\echo '== 4. Ciclos de Compras/Full abertos em produtos com opções (quem está no anúncio sem cadastro?)'
WITH grupos AS (
  SELECT organization_id, user_product_id
  FROM listings
  WHERE user_product_id IS NOT NULL
  GROUP BY 1, 2
  HAVING count(*) > 1
)
SELECT rc.organization_id, l.user_product_id, rc.ml_item_id, l.listing_type_id, rc.kind, rc.status,
       EXISTS (SELECT 1 FROM products p WHERE p.ml_item_id = rc.ml_item_id) AS tem_cadastro,
       si.primary_ml_item_id AS principal_estoque
FROM replenishment_cycles rc
JOIN listings l ON l.ml_item_id = rc.ml_item_id
JOIN grupos g ON g.organization_id = l.organization_id AND g.user_product_id = l.user_product_id
LEFT JOIN stock_items si ON si.id = l.stock_item_id
WHERE rc.status <> 'completed'
ORDER BY 1, 2, rc.kind;

\echo '== 5. Kits e as opções de venda do anúncio do kit'
SELECT k.organization_id, k.ml_item_id AS kit, l.user_product_id,
       (SELECT count(*) FROM listings l2
         WHERE l2.organization_id = k.organization_id
           AND l2.user_product_id = l.user_product_id) AS opcoes
FROM kits k
LEFT JOIN listings l ON l.ml_item_id = k.ml_item_id
ORDER BY opcoes DESC NULLS LAST;

\echo '== 6. Cadastros cujo anúncio ainda não tem UP gravado (entram no backfill)'
SELECT p.organization_id, count(*) AS cadastros_sem_up
FROM products p
LEFT JOIN listings l ON l.ml_item_id = p.ml_item_id
WHERE l.user_product_id IS NULL
GROUP BY 1
ORDER BY 2 DESC;

ROLLBACK;
