-- Alíquotas internas modais de ICMS vigentes em 2026.
-- A seed de 20260621120000_tax_report_module ainda tinha valores de 2022/2023
-- ("TODO validar CONFAZ"). Elas entram no DIFAL de toda venda interestadual a
-- não contribuinte, então o DIFAL estava subestimado nessas UFs.
-- Fontes: leis estaduais citadas abaixo + tabela Barbieri Advogados (nov/2026).
-- O FCP fica só onde é geral (RJ, LC 210/2023); em BA e AL ele vale apenas
-- para produtos específicos (supérfluos), não para o modal.

UPDATE "icms_internal_rates" SET "aliquota_base" = 0.19,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'AC';
-- AL: Lei 9.776/2025, 20,5% desde 01/04/2026.
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.205, "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'AL';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.20,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'AM';
-- BA: 20,5% modal; o FCP de 2% é só para supérfluos.
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.205, "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'BA';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.20,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'CE';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.20,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'DF';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.19,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'GO';
-- MA: Lei 12.426/2024, 23% desde 23/02/2025.
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.23,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'MA';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.19,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'PA';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.20,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'PB';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.205, "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'PE';
-- PI: Lei 8.558/2024, 22,5% desde 01/04/2025.
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.225, "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'PI';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.195, "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'PR';
-- RN: Lei 11.999/2024, 20% desde 03/2025.
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.20,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'RN';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.195, "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'RO';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.20,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'RR';
UPDATE "icms_internal_rates" SET "aliquota_base" = 0.20,  "fcp" = 0, "updated_at" = NOW() WHERE "uf" = 'TO';

-- Sem mudança: AP 18, ES 17, MG 18, MS 17, MT 17, RJ 20 + 2 FECP, RS 17,
-- SC 17, SE 19, SP 18.
