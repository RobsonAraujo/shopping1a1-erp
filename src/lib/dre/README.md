# DRE

Demonstrativo de resultado mensal do vendedor Mercado Livre, calculado via API do ML (billing + orders) e opcionalmente ajustado por upload da planilha de conciliação "Por Vendas" (`src/lib/dre/reconciliation/`).

## Conciliação com a planilha Por Vendas

A API de faturamento do ML oscila; a planilha oficial "Por Vendas" é a verdade das **tarifas** do mês. Linhas governadas pela planilha: tudo que a agregação produz **exceto** `revenueMl`, `cancelledSalesMl`, `partialReturnsMl`, `fullShippingMl`, `adsCost`, `productCostErp`, `taxErp` (`isReconciliationGovernedLineKey`, `dre-calculations.ts`).

Estado do mês:

| Status (`DreMonthView.reconciliation`) | Significado |
|---|---|
| `none` | Sem conciliação. |
| `reconciled` | `payload.reconciliation` existe (valores da planilha + `importId`). O import desse id está `confirmed`. |
| `review` | Sobrou estado do fluxo antigo de dois passos: `pending` aplicado e nunca salvo, ou `confirmed` sem a marca no snapshot. Resolve-se em "Revisar conciliação". |

Fluxo:

1. **Prévia** (`POST /api/dre/reconciliation/preview`): cria um import `pending` sem `appliedAt` (rascunho — não toca no snapshot) e devolve `diff` (linhas que mudariam) + `matched` (linhas que já conferem).
2. **Conciliar** (`POST .../[importId]/confirm`, `confirmReconciliationImport`): numa transação, grava os valores da planilha nas linhas `matched` + divergentes aceitas (`applyReconciliationToPayload`: valor e auditoria viram baseline, saem de "ajustado"), marca o import `confirmed` e aposenta os outros do mês (`superseded`; rascunhos são apagados).
3. **Sync** (`persistDreMonthSnapshot` → `mergeSyncedSnapshot`): com `keepReconciliation` (padrão `true`) reaplica `payload.reconciliation` por cima do sync — o resto do mês atualiza. Sem manter, o mês volta a `none` e o import vira `superseded` na mesma transação. O re-sync do nivelamento sempre mantém (custo produto nunca é linha da planilha).
4. **Descartar** (`DELETE .../[importId]`): rascunho é apagado; legado aplicado volta ao baseline **linha a linha** (só o que ainda é exatamente o valor da planilha); `confirmed` vira `superseded` e o mês deixa de estar conciliado sem mudar valores.

Ajuste manual sobre linha conciliada vence a conciliação enquanto for mantido no sync; "Restaurar" volta ao valor da planilha. Auditoria/backup antes de revisar meses legados em produção: `scripts/dre-reconciliation-audit.ts` (somente leitura).

## Nivelamento de custo

Custo unitário por produto e período, só para o DRE (`dre-product-cost-leveling*.ts`). O pedido casa pelo **dia civil em São Paulo** (`orderDateYmdFromOrder`). Alterar um nivelamento exige re-sincronizar os meses afetados: o modal acumula as faixas alteradas (na edição, a faixa antiga **e** a nova), pergunta ao fechar, e a tela do DRE avisa `levelingChangedAfterSync` quando um nivelamento que cobre o mês mudou depois da última sync (exclusões não deixam rastro no banco — só a pergunta ao fechar cobre esse caso).

## Pedidos cancelados e devolvidos

`productCostErp` e `taxErp` (Custo produto, Impostos sobre vendas) saem só de pedidos pagos do mês que não voltaram. Pedidos com `status: "cancelled"` (`paidOrderLinesFromOrders`) já ficam de fora; devoluções pós-entrega continuam `paid` na API de pedidos e são cortadas quando:

- o `order_id` vem nas linhas CXC da fatura, ou na tarifa de devolução (CXDED/CDSDB); ou
- o pedido tem a tag `returned`, `order_request.return` ou pagamento `refunded`/`charged_back`; ou
- tem `not_delivered` há **30 dias ou mais** (`returnedPaidOrderIdsFromOrders`, `api.ts`).

`not_delivered` sozinho é o estado de todo pedido ainda em trânsito. Antes, ele contava como devolução em qualquer idade: no mês corrente ou logo após o fechamento, as vendas a caminho saíam do Custo produto/Impostos e iam para Canceladas.

**Canceladas / devolvidas = soma da própria auditoria.** A linha é a soma dos pedidos cancelados e dos pagos devolvidos do mês. São os mesmos pedidos que saem do custo/imposto e o mesmo bruto que a visão "painel ML" soma ao faturamento. Os pedidos cancelados são buscados **uma vez** por sync, e essa busca alimenta a linha e a auditoria. Antes eram duas buscas: se só uma voltasse vazia, a linha zerava com a auditoria cheia. Busca vazia num mês com vendas ganha uma nova tentativa. O total CXC da fatura vira só conferência (aviso quando diverge). Sem nenhum pedido cancelado/devolvido, a linha vem da lista CXC da fatura (linha e auditoria iguais).

A view "como o painel ML" (`applyDreIncludeCancelledView`, `dre-calculations.ts`) soma de volta ao faturamento só o bruto dos pedidos **cancelados** (`cancelledIncludeOverlay.revenueGross`, mesmo quando é zero). O bruto dos devolvidos pagos já está no faturamento. Ela **não** ajusta Custo produto/Impostos sobre vendas. Nos modais de auditoria, cancelados e devolvidos aparecem marcados na linha do produto, fora do total.

Devolução faturada neste mês de uma venda de **outro** mês não entra neste corte: o pedido não está no scrape pago do mês.

## Integridade do sync

- **Fonte indisponível não é zero.** `buildDreMonthSnapshot` devolve `unavailableLineKeys`, e `persistDreMonthSnapshot` → `mergeSyncedSnapshot({ keepPreviousLineKeys })` mantém o último valor **sincronizado** dessas linhas, com auditoria e baseline. A marca fica em `payload.keptFromPrevious`. Linhas cobertas:
  - ADS de mês com mais de 90 dias (a API de Ads só cobre 90 dias) ou com erro;
  - linhas que só a fatura traz (Devoluções parciais, Tarifa de devolução, Tarifas especiais, Full armazém, Minha Página, Afiliados, Full envios/inconf. sem Relatório Full) quando a fatura falha ou volta vazia;
  - Canceladas quando a busca de cancelados falha.
- **Linha × auditoria.** `checkLineAuditConsistency` (`dre-line-audit.ts`) roda ao gravar: linhas cujo valor não bate com a soma da própria lista vão para `payload.lineAuditMismatches` (nota cinza no modal de auditoria). Ficam de fora ajuste manual e conciliação.
- **Linha zerada fora do padrão.** `detectZeroLineAnomalies` (`dre-line-anomalies.ts`) é calculado na view anual, sem custo. Cobre Canceladas, Tarifa ML e Frete vendedor quando zeram num mês com vendas, se a mediana dos outros meses é ≥ 1% e o esperado é ≥ R$ 100 (no mês corrente, só a partir do dia 10). A tela mostra ponto âmbar na célula, linha no painel do mês e toast pós-sync com "Sincronizar de novo".
- **Uma busca por sync.** Anúncios (cache por sync), cancelados, produtos, nivelamentos, tributário e kits são carregados uma vez para pedidos ativos, cancelados e devolvidos.

## Imposto sobre vendas (`taxErp`)

A fonte da verdade do % é o **relatório tributário**: ele calcula venda a venda (UF de destino, contribuinte, ICMS/DIFAL, PIS/COFINS e créditos). O DRE aplica o % de cada anúncio (imposto ÷ receita, sem arredondar) à receita do anúncio no mês, sem canceladas e devolvidas. Uma função só faz isso: `computeDreSalesTax` (`dre-sales-tax.ts`), usada pelo sync e pelo "Atualizar imposto".

- **Ordem do %:** tributário do mês por anúncio → por SKU → % do próprio anúncio do kit → média dos componentes do kit → relatório de mês anterior (marcado na auditoria) → sem %.
- **Não depende de custo cadastrado.** Antes, anúncio sem custo ficava com imposto 0.
- **Aceita % negativo.** O crédito de um produto abate o débito dos outros, como na apuração. O total do mês continua com piso em 0.
- **Simples Nacional:** alíquota efetiva do DAS configurada (mesma regra da Lucratividade).
- **Média do mês:** ponderada pelo **faturamento** (imposto ÷ faturamento), não pela quantidade.

A conta que liga as duas telas, no modal de auditoria (`buildDreTaxBridge`): **imposto do tributário − imposto das devolvidas pagas (que estão no tributário e saem do DRE) = Impostos sobre vendas**. O que sobra ("outras diferenças") vem com o motivo: pedidos diferentes, % de outro mês ou anúncio sem %.

`payload.taxSource` registra a versão do relatório usada (`generatedAt`), os números do mês no tributário, pedidos, base e imposto das devolvidas. A view anual compara com o relatório atual (`resolveMonthTaxStatus`, uma query leve só com metadados):

| Status | Quando | Ação |
|---|---|---|
| `ok` | o DRE usou a versão atual de um relatório que cobre o mês | — |
| `partial` | mês em andamento | — (informativo) |
| `dre_outdated` | o relatório mudou depois | "Atualizar imposto" (`POST /api/dre/tax/refresh`, só banco, a partir da auditoria salva) |
| `report_outdated` | mês **fechado** com pedidos buscados **antes** do fechamento (`incomplete`), nivelamento alterado depois, ou versão antiga | "Recalcular tributário" (busca pedidos) ou "Atualizar cálculo" (vendas salvas) |
| `report_missing` | mês sem relatório | "Gerar tributário" |

Pedidos buscados **depois** do fechamento contam como relatório atualizado; número de pedidos diferente vira só nota de conferência. Tudo que muda número passa por uma **prévia** (antes → depois) antes de gravar (`TaxRecalcConfirmDialog`). Recalcular o tributário de um mês atualiza sozinho o imposto do DRE do mesmo mês. Ajuste manual em `taxErp` é respeitado (só o baseline atualiza). Depois de sincronizar meses afetados por um nivelamento, o DRE oferece atualizar o cálculo do tributário deles.

## Limitações conhecidas

### Devolução pós-entrega sem vínculo na fatura

Quando a fatura CXC não traz `order_id`, o pedido pago continua no Custo produto/Impostos sobre vendas. Claims (`/post-purchase/v1/claims`) e shipment `returning_to_sender` ainda não são consultados (custo extra no sync).
