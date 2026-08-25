# DRE

Demonstrativo de resultado mensal do vendedor Mercado Livre, calculado via API do ML (billing + orders) e opcionalmente ajustado por upload da planilha de conciliação "Por Vendas" (`src/lib/dre/reconciliation/`).

## Pedidos cancelados e devolvidos

`productCostErp` e `taxErp` (Custo produto, Imposto ML) saem só de pedidos pagos do mês cujo `order_id` **não** aparece nas linhas CXC da fatura (Canceladas / devolvidas). Pedidos com `status: "cancelled"` (`paidOrderLinesFromOrders`) já ficam de fora; devoluções pós-entrega continuam `paid` na API de pedidos, mas são cortadas quando o mesmo `order_id` vem na fatura.

A view "como o painel ML" (`applyDreIncludeCancelledView`, `dre-calculations.ts`) soma a receita bruta de pedidos cancelados de volta ao faturamento (neutralizada pela linha `cancelledSalesMl`, negativa), só para bater com o total que o próprio Mercado Livre mostra — **não** ajusta Custo produto/Imposto ML. Itens cancelados/devolvidos da fatura aparecem nos modais de auditoria com a marca "Cancelado" só para conferência (não somam no total exibido).

Devolução faturada neste mês de uma venda de **outro** mês não entra neste corte (o pedido não está no scrape pago do mês). Linhas CXC sem `order_id` também não casam. Pedidos pagos com tag `not_delivered`/`returned` e pedidos com tarifa de devolução (CXDED/CDSDB) na fatura são tratados como devolvidas e saem do Custo produto/Imposto ML.

## Limitações conhecidas

### Devolução pós-entrega sem vínculo na fatura

Quando a fatura CXC não traz `order_id`, o pedido pago continua no Custo produto/Imposto ML. Claims (`/post-purchase/v1/claims`) e shipment `returning_to_sender` ainda não são consultados (custo extra no sync).
