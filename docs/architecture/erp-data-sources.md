# Mapa de fontes de dados — shopping1a1-erp

> **Uso principal:** Referência rápida para Claude e devs sobre onde cada dado vive, quais tipos são canônicos e como as telas se alimentam. Evita re-exploração do zero a cada sessão.

---

## Módulos e telas

| Rota | O que exibe | Fonte de dados principal |
|------|-------------|--------------------------|
| `/dashboard` | Home operacional: reposição, atalhos, catálogo perdendo, promoções | DB (`replenishment_cycles`, `listings`) + API promoções |
| `/dashboard/resumo` | Redirect → `/dashboard` | — |
| `/dashboard/inventory` | Estoque por SKU (valor, unidades) | DB `warehouse_stock` + ML stock |
| `/dashboard/compras` | Análise por fornecedor + kanban de reposição de compra | ML API + DB `replenishment_cycles` |
| `/dashboard/operacoes-full` | Kanban de envio Full | DB `replenishment_cycles` |
| `/dashboard/envios-full` | Custo de coleta Full por unidade | DB `full_shipments` |
| `/dashboard/produtos` | Cadastro fiscal e custo por SKU | DB `products` |
| `/dashboard/lucratividade` | Margem por anúncio (taxa ML, frete, impostos, ads); modo atual ou por data/range | ML API (preço/vendas, taxas, ads) + DB `products` |
| `/dashboard/catalog-report` | Status de competição no catálogo | DB `catalog_competition_snapshots` |
| `/dashboard/dre` | DRE mensal (receita, COGS, resultado) | ML API + DB |
| `/dashboard/relatorio-tributario` | Apuração fiscal PIS/COFINS + ICMS/DIFAL por venda | DB `tax_report_month_snapshots` + ML API |
| `/dashboard/configuracoes-tributarias` | Regime tributário, alíquotas | DB `company_tax_settings` + `icms_internal_rates` |
| `/dashboard/insights` | Insights cruzados acionáveis | Múltiplas fontes (ver abaixo) |

---

## Tipos canônicos e onde vivem

### Vendas e tributação (`src/lib/tax-report/types.ts`)

| Tipo | Descrição | Campos-chave para insights |
|------|-----------|---------------------------|
| `TransacaoVenda` | Uma linha de venda enriquecida | `sku`, `ufDestino`, `receitaBruta`, `quantidade` |
| `DetalhamentoTributario` | Venda + todos os impostos calculados | `margemOperacionalEstimada`, `impostoTotal`, `incluidoNaApuracao` |
| `SkuAggregation` | Totais por SKU no período | `sku`, `receitaTotal`, `unidadesVendidas`, `transacoes[]` |
| `ApuracaoConsolidada` | Totais do mês (PIS/COFINS + ICMS) | `diagnostico.creditoPisCofinsPerdidoEstimado`, `difalPorUf` |
| `TaxReportPayload` | Payload completo do snapshot | `consolidado`, `porSku[]`, `year`, `month` |
| `RelatorioConsolidado` | Resumo do mês | `faturamento`, `pisCofinsLiquido`, `margemOperacional` |

### Avaliação financeira (`src/lib/financial-evaluation-data.ts`)

| Tipo | Campos-chave para insights |
|------|---------------------------|
| `FinancialEvaluationRow` | `sku`, `title`, `tacosPercent`, `marginAfterAdsPercent`, `marginAfterAdsValue`, `hasActiveAds`, `breakdown.marginPercent` |

### Análise de margem (`src/lib/financial-margin.ts`)

| Tipo | Descrição |
|------|-----------|
| `FinancialMarginBreakdown` | `marginPercent` (margem base sem ads), `marginValue`, `totalCosts`, `salePrice` |

### Análise de compras (`src/lib/purchase-analysis.ts`, `src/lib/purchase-analysis-rows.ts`)

| Tipo | Campos-chave para insights |
|------|---------------------------|
| `PurchaseAnalysisResult` | `coverageDays` (dias de cobertura), `dailyAvg` (média/dia), `performanceTier` ("alta"\|"media"\|"baixa"\|"zero"), `unitsSoldInWindow`, `purchaseStatus` |
| `PurchaseAnalysisItemRow` | `item` (dados ML), `sku`, `totalStock`, `mlStock`, `warehouseStock`, `purchaseLeadTimeDays`, `analysis: PurchaseAnalysisResult` |

### Estoque por relatório (`src/lib/inventory-stock-report.ts`)

| Tipo | Descrição |
|------|-----------|
| `StockReportRow` | Estoque físico (valor contábil): `skus`, `units`, `stockValue`, `unitCost`. **Não tem coverageDays** — use `PurchaseAnalysisResult.coverageDays` para cobertura em dias. |

---

## APIs existentes

### `POST /api/reports/monthly-tax`
- **Gera** o relatório fiscal do mês (streaming SSE)
- **Persiste** em `tax_report_month_snapshots` via upsert
- Retorna `TaxReportPayload`

### `GET /api/financial-evaluation`
- Retorna `FinancialEvaluationRow[]` com margem por anúncio ativo
- Chama ML API (preços, taxas, ads PADS) + DB (custos de produto)
- Lento (~5s) pois vai ao ML em tempo real
- Query opcional `from`/`to` (`YYYY-MM-DD`): modo período — só anúncios com venda paga; preço médio das vendas; TACOS do mesmo intervalo; resposta inclui `mode`, `salesCount`, `periodDays`
### `GET /api/dre?year=&month=`
- Retorna DRE mensal
- Combina ML API + DB

### `GET /api/inventory/[mlItemId]`
- Estoque e movimentações de um anúncio específico

---

## Campos de alto valor para insights

| Campo | Onde está | Para que serve |
|-------|-----------|----------------|
| `margemOperacionalEstimada` | `DetalhamentoTributario` | Margem real por venda (base para mapa DIFAL) |
| `creditoPisCofinsPerdidoEstimado` | `ApuracaoConsolidada.diagnostico` | Crédito fiscal perdido por custo não cadastrado |
| `coverageDays` | `PurchaseAnalysisResult` | Dias de cobertura de estoque (slow movers + ruptura) |
| `dailyAvg` | `PurchaseAnalysisResult` | Média de vendas por dia |
| `performanceTier` | `PurchaseAnalysisResult` | Classificação de rotação ("alta"\|"media"\|"baixa"\|"zero") |
| `tacosPercent` | `FinancialEvaluationRow` | % de ads sobre receita total |
| `marginAfterAdsPercent` | `FinancialEvaluationRow` | Margem líquida após descontar ads |
| `receitaTotal` | `SkuAggregation` | Receita total por SKU no período (base para Pareto) |
| `ufDestino` | `TransacaoVenda` | Estado do comprador (base para mapa DIFAL) |
| `purchaseLeadTimeDays` | `PurchaseAnalysisItemRow` | Lead time de reposição (para alerta de ruptura) |

---

## Como carregar dados nos insights

### Slow movers + Ruptura iminente
```typescript
// src/lib/dashboard-purchase-data.ts
const data = await loadDashboardPurchaseData(token, userId)
// data.rows: PurchaseAnalysisItemRow[]
// row.analysis.coverageDays — dias de cobertura
// row.analysis.dailyAvg — média de vendas/dia
// row.purchaseLeadTimeDays — lead time de reposição
```

### DIFAL por estado + Pareto de receita
```typescript
// src/lib/tax-report/service/generate-monthly-report.ts
const payload = await loadLatestTaxReportSnapshot(sellerId)
// payload.porSku[].transacoes[].transacao.ufDestino
// payload.porSku[].transacoes[].margemOperacionalEstimada
// payload.porSku[].receitaTotal
```

### Ads × Margem
```typescript
// Client component via fetch('/api/financial-evaluation')
// row.tacosPercent vs row.breakdown?.marginPercent
// row.hasActiveAds — filtrar apenas com ads ativos
```

---

## Função para buscar snapshot mais recente

`loadLatestTaxReportSnapshot(sellerId)` em `src/lib/tax-report/service/generate-monthly-report.ts`:
```typescript
// Retorna o snapshot mais recente disponível (qualquer mês)
// ou null se não houver nenhum gerado ainda
```

---

## Padrões do projeto

- **Server Components**: Carregam dados direto (sem fetch HTTP interno). Ver `compras/page.tsx` como modelo.
- **Client Components**: Chamam APIs via `fetch`. Ver `financial-evaluation-client.tsx` como modelo.
- **Sessão**: `const { accessToken } = getSessionAccessState(cookieStore)` + `const { userId } = readSession(cookieStore)`. `userId` = `sellerId` no banco.
- **Redirecionamento**: `if (session.needsRefresh) redirect(refreshSessionPath(pathname))`
- **UI**: Usar componentes de `src/components/ui/` (Button, Card, Badge, etc.)
- **Tipos canônicos**: Sempre importar de `src/lib/tax-report/types.ts` ou `src/lib/financial-evaluation-data.ts` — nunca redefinir localmente.
