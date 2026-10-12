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

`productCostErp` e `taxErp` (Custo produto, Impostos sobre vendas) saem só de pedidos pagos do mês cujo `order_id` **não** aparece nas linhas CXC da fatura (Canceladas / devolvidas). Pedidos com `status: "cancelled"` (`paidOrderLinesFromOrders`) já ficam de fora; devoluções pós-entrega continuam `paid` na API de pedidos, mas são cortadas quando o mesmo `order_id` vem na fatura.

A view "como o painel ML" (`applyDreIncludeCancelledView`, `dre-calculations.ts`) soma a receita bruta de pedidos cancelados de volta ao faturamento (neutralizada pela linha `cancelledSalesMl`, negativa), só para bater com o total que o próprio Mercado Livre mostra — **não** ajusta Custo produto/Impostos sobre vendas. Itens cancelados/devolvidos da fatura aparecem nos modais de auditoria com a marca "Cancelado" só para conferência (não somam no total exibido).

Devolução faturada neste mês de uma venda de **outro** mês não entra neste corte (o pedido não está no scrape pago do mês). Linhas CXC sem `order_id` também não casam. Pedidos pagos com tag `not_delivered`/`returned` e pedidos com tarifa de devolução (CXDED/CDSDB) na fatura são tratados como devolvidas e saem do Custo produto/Impostos sobre vendas.

## Limitações conhecidas

### Devolução pós-entrega sem vínculo na fatura

Quando a fatura CXC não traz `order_id`, o pedido pago continua no Custo produto/Impostos sobre vendas. Claims (`/post-purchase/v1/claims`) e shipment `returning_to_sender` ainda não são consultados (custo extra no sync).
