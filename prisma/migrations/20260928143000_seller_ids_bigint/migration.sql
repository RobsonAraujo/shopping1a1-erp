-- Ids de vendedor do Mercado Livre passaram de 2^31: a conta 3711648215 não cabia
-- em INTEGER (máx 2.147.483.647) e o callback OAuth quebrava com
-- "value out of range for the type" — signup de conta ML nova bloqueado.
--
-- int4 -> int8 é rewrite de tabela (lock ACCESS EXCLUSIVE). PK, UNIQUE e índices
-- dependentes são reconstruídos pelo Postgres; nenhuma FK, view ou coluna gerada
-- depende destas colunas.
--
-- ATENÇÃO: sem rollback depois que o primeiro seller > 2^31 for gravado —
-- voltar a INTEGER falharia com o mesmo erro.

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';

-- AlterTable
ALTER TABLE "ml_seller_credentials" DROP CONSTRAINT "ml_seller_credentials_pkey",
ALTER COLUMN "ml_user_id" SET DATA TYPE BIGINT,
ADD CONSTRAINT "ml_seller_credentials_pkey" PRIMARY KEY ("ml_user_id");

-- AlterTable
ALTER TABLE "organization_ml_sellers" DROP CONSTRAINT "organization_ml_sellers_pkey",
ALTER COLUMN "ml_user_id" SET DATA TYPE BIGINT,
ADD CONSTRAINT "organization_ml_sellers_pkey" PRIMARY KEY ("organization_id", "ml_user_id");

-- AlterTable
ALTER TABLE "revenue_simulations" ALTER COLUMN "seller_id" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "simples_revenue_month_snapshots" ALTER COLUMN "seller_id" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "tax_report_month_snapshots" ALTER COLUMN "seller_id" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "tax_report_simulation_snapshots" ALTER COLUMN "seller_id" SET DATA TYPE BIGINT;
