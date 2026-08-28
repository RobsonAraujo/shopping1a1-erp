# Tributário — Simples Nacional

Página própria (`/dashboard/simples-nacional`), separada da apuração de Lucro
Real (`src/lib/tax-report/`). O modelo de tributação do Simples é
fundamentalmente diferente: um percentual único (DAS) sobre o faturamento
bruto, por faixa de RBT12 — sem crédito/débito por operação.

## Premissa desta v1

Só **Anexo I (comércio/revenda)** é suportado — é o caso de uso deste ERP
(revenda via Mercado Livre). Anexo II-V e Fator R (para serviços) não estão
implementados.

## Estrutura

```
src/lib/simples-nacional/
  anexo-i-table.ts       # tabela estática (faixas, alíquota nominal, parcela a
                          # deduzir, composição por tributo) — LC 123/2006
  das-calculator.ts       # funções puras sobre a tabela estática
  rbt12.ts                 # agregação de receita dos 12 meses anteriores, com cache por mês
  simulate-lucro-real.ts        # roda o motor de Lucro Real com forceRegime
  simulation-snapshot-data.ts   # CRUD de TaxReportSimulationSnapshot
  types.ts
```

## DAS pago — alíquota manual (MVP)

O valor do DAS efetivamente pago usa `CompanyTaxSettings.simplesAliquotaEfetivaPercent`
(configurado manualmente em `/dashboard/configuracoes/empresa`, geralmente
copiado do PGDAS-D) — **não** um cálculo automático pelas tabelas oficiais
de Anexo/Faixa/Fator R. A faixa/alíquota nominal calculada por `das-calculator.ts`
é só informativa, para comparação.

## RBT12

`loadRbt12` soma a receita dos 12 meses **anteriores** ao mês de referência
(definição legal — não inclui o mês corrente).

**Cache por mês** (`SimplesRevenueMonthSnapshot`): mês fechado é imutável na
prática, então cada mês só é calculado uma vez — daí em diante é lido do
cache (1 query, zero chamada ao ML). Na primeira vez que um mês aparece na
janela do RBT12: tenta `DreMonthSnapshot` já sincronizado primeiro (barato);
cai para busca ao vivo no Mercado Livre (`fetchPaidOrdersByPeriod`) só se não
houver snapshot de DRE — e o resultado é gravado no cache pra nunca mais
precisar recalcular aquele mês. `loadRbt12(..., forceRefresh: true)` (botão
"Atualizar" na UI) ignora o cache e recalcula os 12 meses do zero.

## Simulador Simples x Lucro Real

Roda `generateMonthlyTaxReport` (mesmo motor da página de Lucro Real) com
`forceRegime: "LUCRO_REAL"` sobre os dados reais do mês — nunca persiste em
`CompanyTaxSettings`, nunca grava em `TaxReportMonthSnapshot`. Resultado vai
para `TaxReportSimulationSnapshot`, tabela fisicamente separada — nunca lida
por Produtos/Lucratividade/DRE.

**Comparação parcial**: o motor de Lucro Real não calcula IRPJ/CSLL (removidos
do cálculo — ver `src/lib/tax-report/types.ts`). O DAS embute IRPJ+CSLL+CPP+
ICMS+PIS+COFINS; a simulação compara só os tributos operacionais (PIS/COFINS +
ICMS/DIFAL). Ver disclaimer na UI (`simples-simulador-panel.tsx`).

**Sem crédito de ICMS-ST recuperável**: a simulação também força
`forceConsiderIcmsStRecuperavel: false` (mesmo mecanismo de `forceRegime`, ver
`GenerationOverrides` em `generate-monthly-report.ts`). Uma empresa que sempre
foi Simples nunca passou pela tela de Configurações tributárias (só
visível/aplicável em Lucro Real), então `considerIcmsStRecuperavel` no banco é
o default de fábrica, nunca calibrado por ela — sem forçar `false`, a
simulação creditaria uma tese (Tema 201/STF) que a empresa nunca
levantou/aplicou, superestimando a vantagem do Lucro Real.

**Sempre exclui ICMS da base de PIS/COFINS**: idem, força
`forceExcludeIcmsFromPisCofinsBase: true`. Diferente do ICMS-ST recuperável
(tese discutível), essa exclusão é jurisprudência pacificada (RE 574.706/STF,
"tese do século") — não é uma escolha, é o cálculo correto. Forçar `true`
evita depender do que porventura esteja configurado no banco de uma empresa
que nunca passou por essa tela.

**Comparação por SKU**: `compararSimplesXLucroReal` também mapeia
`payload.porSku` (já vem do motor real) com `skuImpostoOperacionalPercentual`
— o % de Lucro Real varia por produto, o % do Simples é sempre a mesma
alíquota efetiva pra todo SKU (o DAS não discrimina por anúncio).

## Limitações conhecidas

- Só Anexo I (comércio)
- Sem Fator R (Anexo III x V)
- Alíquota efetiva do DAS é manual, não calculada pelas tabelas oficiais
- RBT12 ao vivo (sem `DreMonthSnapshot` histórico) pode ser lento só na primeira vez que cada mês entra na janela — depois fica em cache (`SimplesRevenueMonthSnapshot`)
- Simulação sempre assume `considerIcmsStRecuperavel: false` e `excludeIcmsFromPisCofinsBase: true`; `originUf`/`pisRatePercent`/`cofinsRatePercent`/tabela ICMS continuam herdados do config real (possivelmente nunca revisados)

## Multi-tenant

Já nasce tenant-ready — `TaxReportSimulationSnapshot` e
`SimplesRevenueMonthSnapshot` têm `organizationId` na unique key desde o dia 1
e estão em `TENANT_SCOPED_MODELS`. Registro completo em
[`docs/architecture/saas-migration.md`](../../../docs/architecture/saas-migration.md).
