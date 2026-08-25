# DRE

Demonstrativo de resultado mensal do vendedor Mercado Livre, calculado via API do ML (billing + orders) e opcionalmente ajustado por upload da planilha de conciliação "Por Vendas" (`src/lib/dre/reconciliation/`).

## Pedidos cancelados

`productCostErp` e `taxErp` (Custo produto, Imposto ML) são calculados só a partir de pedidos com `status: "paid"` (`paidOrderLinesFromOrders`, `src/lib/mercadolibre/api.ts`) — pedidos cancelados nunca entram nessa soma, pois o produto não foi de fato enviado.

A view "como o painel ML" (`applyDreIncludeCancelledView`, `dre-calculations.ts`) soma a receita bruta de pedidos cancelados de volta ao faturamento (neutralizada pela linha `cancelledSalesMl`, negativa), só para bater com o total que o próprio Mercado Livre mostra — **não** ajusta Custo produto/Imposto ML, já que esse custo nunca foi contado. Os itens cancelados aparecem nos modais de auditoria de Custo produto/Imposto ML com a marca "Cancelado" só para conferência (não somam no total exibido).

## Limitações conhecidas

### Devolução pós-entrega não é rastreada (2026-08-24)

Quando um produto é devolvido **depois** de entregue, a API do Mercado Livre não muda `order.status` (permanece `paid`) — o pedido continua contando normalmente em faturamento, Custo produto e Imposto ML. O sinal de devolução fica em outro recurso, que o projeto não consulta hoje.

Investigação (via documentação pública do ML, ago/2026 — conferir a doc oficial antes de implementar, pode ter mudado):

- **Shipments**: o status vai para `not_delivered` com substatus `returning_to_sender` enquanto o produto está em trânsito de volta; `GET /shipments/{shipment_id}/history` traz o histórico de status/substatus. O projeto já guarda `order.shipping.id` (`src/lib/mercadolibre/types.ts`), então dá pra consultar por pedido.
- **Claims** (endpoint atual — o antigo `/v1/claims/` foi descontinuado em 06/05/2024): `GET /post-purchase/v1/claims/search?order_id={id}` (ou `resource_id` + `resource=order`), com filtros adicionais (`players.role`, `stage`, `status`, `reason_id`, `date_created`). Permite achar claims de devolução direto por `order_id`, sem precisar do `shipping.id`.

Nenhum dos dois é chamado hoje em lugar nenhum do código (zero ocorrências de `claims`, `mediations`, `post-purchase`, `returning_to_sender`). Implementar isso é uma integração nova — fetch + tipos + decisão de produto sobre como expor no DRE (nova linha? ajuste em Custo produto/Imposto ML, como já existe para cancelados?) — e custa uma chamada extra por pedido no sync, que já tem gargalos de performance conhecidos. Tratar como iniciativa separada.
