# Central de anúncios (módulo `rotina`)

Na tela e no menu o nome é **Central de anúncios**, e a página é `/dashboard/central-anuncios` (`/dashboard/rotina` redireciona para ela). As APIs (`/api/rotina/*`) e o código mantêm o nome interno `rotina`.

Página `/dashboard/central-anuncios`: a lista de trabalho diária de quem cuida dos **anúncios próprios** e do **catálogo**. Não é relatório. Cada linha é uma tarefa ("colocar promoção", "brigar no catálogo") com o **preço mínimo** que mantém a margem que o usuário definiu.

## Estrutura

```
src/lib/rotina/
  rule-registry.ts      # regras: chave, tipo, segmento, rótulos. Só metadado (client-safe)
  settings-shared.ts    # tipo + defaults + limites das metas (client-safe)
  rules.ts              # predicados das regras e meta efetiva. Puro
  floor-view.ts         # piso que vale (margem × PMA), desconto máx., faixas, veredito de catálogo. Puro
  catalog-history.ts    # "perdendo desde": começo da sequência atual nos snapshots. Puro
  visibility.ts         # feito / adiado / ignorado / continua. Puro
  reconcile.ts          # memória das ações a cada rodada (abre, reabre, resolve). Puro
  links.ts              # catálogo → próprio, e vínculo novo. Puro
  view.ts               # monta a página inteira (frases, ordem, listas de apoio). Puro
  view-summary.ts       # contadores e grupos, já com decisões otimistas (client-safe)
  floors.ts             # os dois mínimos com cotação real do ML (I/O)
  refresh.ts            # o "Atualizar": rodada em lotes, trava, retomada (I/O)
  rotina-view-data.ts   # leitura da página — só banco (I/O)
  rotina-settings.ts / listing-targets.ts / action-state-data.ts / health-row.ts
src/lib/pricing/min-price-segments.ts   # mínimo ciente das faixas de frete (puro, cotação injetada)
```

UI: `src/app/dashboard/central-anuncios/` + `src/components/rotina/`. Rotas: `/api/rotina/{refresh,actions,settings,targets/[mlItemId]}`.

## Duas fontes de dado

| Fonte | O que traz | Frescor |
|---|---|---|
| **Rodada** (`ListingHealth`, botão Atualizar) | margem MC e após ADS, os dois mínimos, ADS/TACOS, promoção, vendas/dia, tags e vínculos | quando o usuário clica (sem cron na v1) |
| **Catálogo ao vivo** (`Listing.catalog*`, cron de catálogo) | perdendo / dividindo / ganhando, preço p/ ganhar | ~1h por seller |

A página **só lê o banco**: abrir não chama o ML. As regras são avaliadas **na leitura**, então mudar uma meta vale na hora. O que muda com a meta e exige ML é só o preço mínimo: ele aparece como "calculado com outra meta" até recalcular.

## Regras

| Chave | Seg. | Tipo | Dispara quando |
|---|---|---|---|
| `catalog_losing` | Cat. | condição | `catalogStatus = losing` |
| `promo_expiring` | Próp. | condição | promoção termina em ≤ `promotionExpiringSoonDays` |
| `catalog_takeover` | Próp. | evento | catálogo **novo** ligado a um próprio |
| `margin_below_min` | Ambos | condição | margem **após ADS** < mínimo (MC se o ADS não serve) |
| `below_pma` | Ambos | condição | preço < PMA |
| `tacos_above` | Próp. | condição | ADS ativo e TACOS 7d > meta, ou gasto sem venda |
| `catalog_shared` | Cat. | condição | `catalogStatus = shared` |
| `ads_missing` | Próp. | condição | `adsStatus` ≠ `active` (usa `adsStatus`, não `hasActiveAds`, que conta pausado como ativo) |
| `promo_missing` | Próp. | condição | consulta de preço OK e sem desconto |

Invariante herdado da Home: **consulta que falha não vira problema**.
- Falha de preço → `promotionKnown=false` → não entra em "sem promoção". Antes, a Lucratividade engolia a falha com fallback; agora marca a linha.
- Product Ads fora do ar → nenhuma regra de ADS.

## Preço mínimo

- Meta = margem mínima **após ADS** do anúncio (exceção em `ListingTarget`) ou do segmento.
- **Mínimo após ADS** = menor preço com MC ≥ meta + TACOS. É exato no modelo da Lucratividade (`computeMarginAfterAds` = MC − TACOS). O card mostra também o **mínimo MC**.
- **PMA é piso duro.** O PMA dentro de uma faixa proibida empurra o piso para o fim da faixa.
- **Faixas de frete**: a margem não é monotônica no limiar do frete grátis (~R$ 79): abaixo dele o frete não é do vendedor. `findMinSalePriceBySegments` divide a busca em segmentos de frete constante (o limiar sai das cotações) e devolve o menor preço válido + as faixas a evitar. A Lucratividade continua com a busca antiga (`refineMinSalePriceForTargetMargin`); trocar lá é decisão separada.
- **Veredito de catálogo**: o preço p/ ganhar é comparado com o piso. Se ele cair numa faixa proibida, o sugerido fica logo abaixo dela.

## Simulador de preço ("e se eu vender a R$ X?")

- Botão **Simular** em cada ação (menos o aviso de catálogo novo) e na aba Anúncios.
  - Nas ações de catálogo perdendo/dividindo, abre já testando o **preço p/ ganhar** (ou o sugerido logo abaixo da faixa do frete).
  - Nas outras ações, abre testando o mínimo (ou o preço de hoje).
- Mesma conta da Lucratividade e do preço mínimo (`computeFinancialMargin` + `computeMarginAfterAds`, em `simulate-margin.ts`). Simular o preço mínimo devolve a margem-alvo.
- Custo, imposto, rebate e ADS vêm de `ListingHealth.pricingInputs`, gravado na rodada. Taxa e frete são cotados no ML para cada preço: 1 + 2 chamadas por simulação.
  - Sem retrato (catálogo antes da primeira atualização), monta a linha da Lucratividade na hora: mais lento.
- Rota `POST /api/rotina/simulate` (`{ mlItemId, prices[] }`, até 5). Preço já simulado não consulta o ML de novo; os testados ficam em "Comparar".

## Rodada (`refresh.ts`)

- Trava por organização: `pg_advisory_xact_lock` + run `running` com `heartbeatAt`. Run sem batimento há 2 min é considerada morta.
- Lotes de 20, cada um gravado em transação própria (retrato + reconciliação + eventos).
- Orçamento de 240 s (`ROTINA_REFRESH_BUDGET_MS` sobrescreve em teste). Passou dele, fica `partial` e o client chama de novo.
- **Baseline**: a primeira rodada completa não gera `catalog_takeover`; os vínculos existentes vão para "Próprios que já têm catálogo ligado". Catálogo criado há mais de 30 dias também não vira evento.
- Só sai do retrato o que o ML confirmou que não está mais ativo/pausado. Falha de leitura **não** apaga.
- Custo: 3–5 chamadas por anúncio para preço/taxa/frete/rebate (a mesma linha da Lucratividade), mais ~20–40 cotações por anúncio para os mínimos (só frete na busca do limiar). Log `[rotina-refresh]` com tempo por etapa.

## Pendente de validação com dados reais

1. **Vínculo catálogo → próprio**: a ordem é `item_relations` → `catalog_product_id` → SKU único. Conferir num caso real ("o ML criou o catálogo do meu MLB X") quais campos o `/items/bulk` traz.
2. **`adsStatus` nulo** ("Fora do Product Ads"): confirmar se é "não elegível" ou "nunca anunciado".
3. **Faixa do frete**: a cotação de frete repassa o `free_shipping` do item. Se o ML cotar o frete abaixo de R$ 79 para item com frete grátis marcado, não haverá faixa (o que também é o comportamento real do anúncio).
4. Links do painel do vendedor (promoções/ADS): hoje "Abrir no ML" usa o permalink do anúncio.

## Deploy

`prisma migrate deploy` **antes** do código: `loadOperationalSettings` lê todas as colunas de `operational_settings`. São duas migrations:
- `20261110120000_rotina`: tabelas e colunas `rotina_*`
- `20261110150000_rotina_pricing_inputs`: `listing_health.pricing_inputs`, usado pelo simulador
