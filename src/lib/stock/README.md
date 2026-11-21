# Estoque automático

Livro de estoque por produto físico. Vendas de todos os canais baixam sozinhas. O usuário registra as entradas de mercadoria e os envios ao Full: escolhe os produtos e a quantidade, e o Full sobe sozinho no ML quando a mercadoria chega. O custo por lote (PEPS) troca sozinho quando o lote antigo acaba, e o inventário mensal confere e corrige.

Telas: `/dashboard/inventory` (Posição), `/entradas`, `/movimentacoes`, `/inventario`, `/historico` (fechamento mensal, que já existia).

O ícone ao lado do título "Estoque" abre o guia "Como funciona o estoque" (`StockGuide.tsx`), com as regras para quem usa. Ao mudar uma regra aqui, atualize o guia também.

## Os números de um produto

| Número | O que é | De onde vem |
|---|---|---|
| **Em casa** | galpão + depósito | o livro: soma das `StockMovement` com `location = own` (`StockBalance`) |
| **Depósito** | o "estoque no depósito" do ML, ou seja, o que está separado para vender fora do Full | ML: `seller_warehouse` em `GET /user-products/{UP}/stock` |
| **Galpão** | o que ainda não foi separado | conta: Em casa − Depósito. Ninguém lança. |
| **Full** | tudo que está com o ML, menos o perdido | ML: `GET /inventories/{id}/stock/fulfillment` |
| **Total** | Em casa + Full | conta |

- Leitura do ML que falhou vira `null`, e a tela mostra "—", nunca 0 (`stock-position.ts`).
- **Full fora da venda:** a tela nomeia cada parte pelo status do ML (`not_available_detail`, guardado em `StockItemMlPosition.fullUnavailableDetail`): em transferência (`transfer`), retirada (`withdrawal`), sem cobertura fiscal (`noFiscalCoverage`), processo interno… O perdido (`lost`) aparece à parte e fica fora do total.
  - Só `transfer` é "em transferência". Antes a tela chamava tudo que estava fora da venda de "em transferência" (um anúncio mostrou 44 quando o ML tinha 19).
- Separar mercadoria para venda continua sendo feito no ML: o Galpão cai sozinho.

## Identidade: item de estoque = `user_product_id`

- As "opções de venda" (Clássico, Premium, B2B…) são MLBs diferentes com o mesmo UP e o mesmo estoque no ML.
- `StockItem` é 1 por UP, e cada `Listing` aponta para o seu (`stockItemId`). Nunca por SKU: o SKU é editável e repetível.
- MLB desconhecido numa venda: a sincronização busca o anúncio e o liga pelo UP (`stock-items.ts`).
- Kit (tag `bundle`) não vira item: a venda baixa os componentes (`KitItem`).

## Sincronização (`stock-sync.ts`) — sem cron

Não existe cron de estoque. A sincronização roda em três situações:

- **Quando alguém usa o ERP:** o `StockBackgroundSync`, montado no layout do dashboard, entra em segundo plano. Ele não recebe nada do servidor e só começa com a página já pronta. Roda no máximo 1 vez a cada 10 min por aba, e o servidor responde `skipped: "fresh"` na hora, sem chamar o ML, se outra aba ou pessoa já leu.
  - Fora do Estoque, faz só o leve: vendas novas + depósito/Full de até 30 produtos que venderam.
  - Na Posição do Estoque, relê depósito e Full de tudo, no máximo a cada 2 h.
- **Nos botões da tela:** "Sincronizar agora" e "Reler tudo no ML".
- **Antes do fechamento mensal**, que já tem cron: `syncStockBeforeSnapshot` em `inventory-month-snapshot.ts`.

Passos de cada rodada:

1. **Vendas** (`stock-orders-sync.ts`):
   - Lê os pedidos alterados desde o cursor (`order.date_last_updated`, com 10 min de sobreposição) em **fatias de 6 h**, da mais antiga para a mais nova.
   - Cada fatia grava e avança o cursor. Em segundo plano, passou de 45 s, para, e a próxima rodada continua, sem perder nem repetir nada.
   - Aplica `planOrderStockEffects` (`stock-order-effects.ts`, puro).
   - O local de cada linha vem de `order_items[].stock.node_id`: um nó do vendedor (`BRP…`, guardado em `StockSyncState.sellerNodeIds`) é saída de casa; um centro do ML é Full.
   - O envio só é lido quando falta o nó, num cancelamento, ou para mostrar o canal de uma venda de casa.
2. **Leitura do ML** (`stock-positions.ts`): só lê e grava depósito e Full, para exibição.
   - Na releitura completa, liga também os anúncios novos (ativos ou pausados) que ainda não viraram item (`linkNewSellerListings`). Assim o produto aparece no Estoque, e dá para registrar a entrada dele, antes da primeira venda.

Cada evento vira o seguinte:

| Evento | Em casa | Lote |
|---|---|---|
| Venda paga, saiu de casa | −qtd | consome |
| Venda paga, saiu do Full | — (o ML cuida) | consome |
| Cancelada antes do envio | estorna | devolve ao lote de origem (se aberto) |
| Cancelada depois do envio ou devolvida | pendência "devolução a conferir" | conforme a decisão |
| **Registrar saída: Envio ao Full** (`full_transfer`) | −qtd | — (só muda de lugar) |
| **Voltou do Full** (`full_return`, na gaveta do produto) | +qtd | — |
| Registrar saída: perda, avaria, brinde… (`manual_out`) | −qtd | consome |
| Entrada de mercadoria | +qtd | cria lote |
| Ajuste, inventário | ±qtd | consome ou devolve |

- Tudo idempotente pela chave única de `StockMovement`. O saldo é recalculado (não incrementado) a cada escrita, com o livro travado (`pg_advisory_xact_lock`) só durante as gravações: as chamadas ao ML ficam fora das transações.
- Durante a viagem até o Full (saída registrada, ML ainda não recebeu), o total fica temporariamente menor. É o comportamento aceito.

## Por que não detectamos o Full sozinhos

Foi construído e removido, a pedido do usuário: precisava de cron e era complicado. Ficou registrado o que a conta real mostrou (nov/2026):

- **O recebimento não vira operação.** Envios de 240 e 775 un (`INBOUND_COLLECT` no faturamento) não aparecem em `/stock/fulfillment/operations/search`: não há `INBOUND_RECEPTION`, só `TRANSFER_*` entre os centros do ML. A única pista é o total do Full subir.
- **As réplicas da API do Full divergem:** o mesmo inventário marcou 174 e 183 com 1,5 s de diferença (`noFiscalCoverage` aparecendo e sumindo). Uma detecção por diferença de total precisaria de leitura por maioria.
- **"Em transferência" é mercadoria que já está com o ML**, andando entre os centros dele. Também existem `withdrawal` (retirada voltando ao vendedor) e `lost` (perdido, fica fora do total).
- **O faturamento traz a quantidade por envio**, mas chega atrasado e estoura o limite (429) com facilidade.

## Custo por lote (`stock-lots.ts`)

- Cada entrada cria um `StockLot` com todos os campos fiscais de custo. A ativação cria o lote de abertura ao custo do cadastro.
- Toda saída de propriedade consome o lote mais antigo (`planConsumption`, puro). Envio ao Full e "Voltou do Full" só mudam o lugar.
- **Quando o lote vigente zera**, o próximo passa a valer:
  - os `Product` das opções de venda do item recebem o custo novo, e a Lucratividade, a Central e a Calculadora pegam sozinhas;
  - cria um `DreProductCostLeveling` com o custo antigo, do dia seguinte ao último nivelamento (ou da criação do produto) até a véspera da troca. É a mesma regra da sugestão do cadastro, então DRE e Tributário continuam certos.
- Custo editado no cadastro depois da ativação corrige o lote vigente (`syncActiveLotCostFromProduct`).

## Inventário (`stock-counts.ts`)

- **Criar** congela a hora de referência, o Em casa e o "a enviar" (vendido de casa, ainda não despachado: está na prateleira).
- **Folha em PDF** (`stock-count-pdf.ts`): pode ser cega. A diferença não vai no papel.
- **Aprovar** lança cada ajuste: contado − (Em casa + a enviar na referência), aplicado sobre o saldo atual (`countLineAdjustment`). O que não foi contado (em branco) não ajusta.

## Ponte com os módulos por anúncio (`stock-bridge.ts`)

Compras, Kanban, Insights, detalhe do item e fechamento mensal usam `total = estoque do anúncio no ML + galpão`. Com o estoque ativado, o "galpão" de cada anúncio passa a sair do livro:

- anúncio Full: Em casa inteiro;
- anúncio fora do Full: Em casa − depósito;
- só o anúncio principal do item recebe (as outras opções ficam com 0).

Isso acaba com a contagem em dobro do galpão digitado, que já incluía o depósito. Organização sem ativação segue como antes.

## Ativação (`stock-activation.ts`): automática

Não tem tela nem perguntas. Na primeira visita ao Estoque, a própria página ativa: `StockAutoActivation` chama `POST /api/stock/activation` (SSE), com a tela de bloqueio e o progresso.

1. **Preparar:** cria os itens a partir dos anúncios e lê o depósito e o Full no ML.
2. **Ativar** (uma transação): grava o saldo inicial Em casa, os lotes de abertura ao custo do cadastro e a data de corte. Vendas anteriores não contam.

Regras:

- **Saldo inicial** (`stock-opening.ts`, puro): o maior entre o galpão digitado (que já incluía o depósito) e o depósito do ML. Nenhum produto começa com Galpão negativo.
  - A nota da movimentação de abertura diz de onde veio o número. Começa com "Confira:" quando o galpão estava digitado em mais de uma opção de venda ou era menor que o depósito.
  - O primeiro inventário confirma o saldo inicial (o guia "Como funciona o estoque" explica).
- **Sincronização:** começa "fresca", porque quem ativou acabou de ler tudo e o segundo plano não relê o ML logo em seguida.
- **Outra aba já ativou:** conta como sucesso.
- **"Parar" no meio:** não ativa. Os itens já criados ficam para a próxima vez.

## Multi-tenant

Todas as tabelas são tenant-scoped (`TENANT_SCOPED_MODELS`), inclusive `StockSyncState`: sem cron, nada varre todas as organizações.

## Limitações conhecidas

- **Org com mais de um seller:** a leitura do ML usa o token de quem está usando o ERP.
  - Os anúncios de outro seller da mesma org ficam com "—" até alguém daquele seller usar o ERP (ou o fechamento mensal rodar).
  - A ativação lê os anúncios de quem abriu o Estoque. Os de outro seller entram depois, com Em casa 0: confira com um inventário.
- **Ninguém usa o ERP:** nada roda. O primeiro acesso depois lê tudo desde o cursor, em fatias.
- **Variações antigas** (um MLB com várias variações): o estoque fica por anúncio.
- **Estoque negativo** (saiu mais do que entrou): as unidades excedentes não consomem lote. O inventário corrige.
- **Troca de custo por dia:** o dia da troca já usa o custo novo no DRE.

## Testes e sondas

```bash
node --env-file=.env --import tsx --test "src/lib/stock/**/*.test.ts"
npx tsx scripts/probe-stock-ml.ts             # conta real, só leitura: UP, locations, nós, canais
npx tsx scripts/probe-full-inbound-timeline.ts --inventories=ID1,ID2   # operações do Full (histórico da decisão acima)
```
