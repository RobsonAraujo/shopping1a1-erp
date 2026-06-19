# Relatório Tributário Mensal

Módulo de apuração fiscal por venda (Mercado Livre) para **Lucro Real** — PIS/COFINS não-cumulativo, ICMS/DIFAL e estimativa gerencial de IRPJ/CSLL.

## Base legal (resumo)

| Imposto | Fundamento |
|---------|------------|
| PIS/COFINS não-cumulativo | Leis 10.637/2002 e 10.833/2003 |
| Exclusão do ICMS da base PIS/COFINS | RE 574.706 (STF) — parâmetro `excludeIcmsFromPisCofinsBase` |
| Alíquotas interestaduais | Resolução do Senado nº 13/2012 (12% Sul/Sudeste exc. ES, 7% demais, 4% importado >40%) |
| DIFAL | EC 87/2015 |
| CBS/IBS (informativo) | LC 214/2025 |

## Estrutura

```
src/lib/tax-report/
  calculators/     # Funções puras (testáveis)
  ml/              # Pedidos + billing_info ML
  enrichment/      # TransacaoVenda
  service/         # Pipeline + snapshot
  tax-config-data.ts
```

## Tabelas configuráveis (sem deploy)

- **ICMS interno + FCP**: `icms_internal_rates` — UI em `/dashboard/configuracoes-tributarias`
- **CBS/IBS por ano**: `cbs_ibs_vigencia`
- **Empresa**: `company_tax_settings` (regime, UF origem, PIS/COFINS)

## Contribuinte ICMS

O status de contribuinte ICMS vem do campo `taxpayer_type` do `billing_info` do Mercado Livre.

- CNPJ com `taxpayer_type` no ML → contribuinte ou não conforme o valor
- CNPJ sem dado do ML → `contribuinteIcms: null` → tratado como **não contribuinte** no cálculo (DIFAL)

## Pedidos considerados

- Status **`paid`** apenas (`date_closed` no fuso `America/Sao_Paulo`)
- Cancelados/devolvidos **fora** da apuração
- Sem `billing_info`: marcado `dadosFiscaisIndisponiveis`, excluído dos totais (override manual via snapshot futuro)

## Snapshot mensal

- `POST /api/reports/monthly-tax` gera e persiste
- `POST` com `stream: true` envia progresso via SSE (`text/event-stream`); `complete` sem payload — o cliente recarrega via `GET`
- `GET /api/reports/monthly-tax?year=&month=` lê snapshot
- `force: true` no POST recalcula
- **Persistência:** vendas detalhadas ficam em `porSku[].transacoes`; `transacoes` na raiz do JSON salvo fica vazio (menor volume no banco)
- **Performance:** custos de produto carregados em batch (`loadCustoBySkuMap`); rota com `maxDuration = 300` (Vercel)
- **ICMS vs DIFAL:** consolidado e tabela por venda separam ICMS (origem) e DIFAL (UF destino); total em `icmsDifalTotal`
- **Apuração:** consolidado expõe `apuracao` com débito/crédito/líquido (PIS, COFINS, ICMS) e DIFAL por UF; crédito PIS/COFINS na base NF entrada; crédito ICMS de `purchaseIcmsPercent`
- **ICMS saída interna:** usa `saleIcmsPercent` do cadastro; com `hasIcmsSt` aplica alíquota residual (incl. 0%); sem ST e `saleIcmsPercent` 0, usa tabela UF

## Limitações conhecidas

- Apenas **Lucro Real** na v1
- Alíquotas internas: validar periodicamente com CONFAZ (seed inicial com TODO)
- IRPJ/CSLL: estimativa gerencial, não substitui LALUR
- CBS/IBS 2026: informativo, compensado com PIS/COFINS no mesmo período
- DRE existente continua com % simplificado por SKU (não substituído)

## Multi-tenant (futuro)

Impacto SaaS deste módulo (registro completo em [`docs/architecture/saas-migration.md`](../../../docs/architecture/saas-migration.md)):

| Aspecto | Hoje | Na migração |
|---------|------|-------------|
| Snapshot mensal | `sellerId` + ano/mês — ok para múltiplos sellers ML | Adicionar `organizationId`; unique `(org, seller, year, month)` |
| Config fiscal | `company_tax_settings.id = "default"` — global | Uma linha por `organizationId` |
| CMV / produtos | `products.sku` global | `@@unique([organizationId, sku])` |
| ICMS interno | `icms_internal_rates` global (editável na UI) | Seed global + override por org, se necessário |
| Geração | `generateMonthlyTaxReport` usa seller da sessão | Resolver org → sellers ML da org |

**Ao alterar este módulo:** atualizar o registro em `docs/architecture/saas-migration.md` (template em `docs/templates/feature-saas-impact.md`).

## Testes

```bash
node --import tsx --test src/lib/tax-report/**/*.test.ts
```
