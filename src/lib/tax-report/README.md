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
- `POST` com `stream: true` envia progresso via SSE (`text/event-stream`)
- `GET /api/reports/monthly-tax?year=&month=` lê snapshot
- `force: true` no POST recalcula

## Limitações conhecidas

- Apenas **Lucro Real** na v1
- Alíquotas internas: validar periodicamente com CONFAZ (seed inicial com TODO)
- IRPJ/CSLL: estimativa gerencial, não substitui LALUR
- CBS/IBS 2026: informativo, compensado com PIS/COFINS no mesmo período
- DRE existente continua com % simplificado por SKU (não substituído)

## Testes

```bash
node --import tsx --test src/lib/tax-report/**/*.test.ts
```
