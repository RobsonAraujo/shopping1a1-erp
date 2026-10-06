# Home — arquitetura e fontes de dado

A Home (`/dashboard`) é um **workspace configurável**: a grade sai do registry
(`src/lib/home/dashboard/widget-registry.ts`) e a seleção/ordem/coluna saem das
preferências do usuário. Adicionar um card é uma entrada no registry mais um
componente no mapa de `HomeWidgetRenderer` — a página não muda.

Este documento responde três perguntas: **o que carrega num acesso**, **de onde
vem o dado de cada widget** e **quanto custa**. É a referência pra decidir se um
widget novo pode entrar sem encarecer a página mais acessada do produto.

---

## O caminho de um carregamento

A Home é dinâmica (lê `cookies()`), então **não há cache de página**: cada acesso
é um render de servidor.

| # | Etapa | Custo |
|---|-------|-------|
| 1 | `readSession(cookies())` | zero |
| 2 | `getOrganizationContext()` | 1 query, envolvida em `React.cache()` (compartilhada com o layout) |
| 3 | `loadHomeCoreSnapshot` + `loadDashboardLayout` | **13 queries numa onda só** (`Promise.all`): 12 do snapshot mais a leitura do layout por chave primária |
| 4 | Duas ilhas em `<Suspense>` (identidade do seller + card de Vendas) | **1 chamada ML** (`fetchMe`), compartilhada pelas duas via `React.cache()` |
| 5 | Client monta → `/api/dashboard/widgets?keys=…` | **1 request**, só com as chaves dos widgets **visíveis** |
| 6 | Cards de PMA e Promoções entram na viewport | 1 request cada, **chamadas ML** (ver tabela) |

O passo 3 é o que garante conteúdo real na primeira pintura, sem esperar JS. Cada
slice tem `.catch` próprio: **uma slice que falha degrada o card dela, nunca a
página** — o nome entra em `failedSlices` e o widget mostra o aviso.

### Pool de conexões

`DATABASE_POOL_MAX` tem default **5**. As 13 queries do passo 3 saem juntas, então
elas se enfileiram em ~3 ondas, e disputam o pool com o layout. É daqui que vem a
latência de cauda quando há muitos acessos simultâneos — não deixar o passo 3
crescer sem medir.

---

## Estado no client

Três contextos separados, e essa é a decisão de performance central:

| Contexto | Conteúdo | Muda quando |
|----------|----------|-------------|
| `CoreContext` | snapshot do servidor | **nunca** (criado uma vez) |
| `DataContext` | slices do batch | um fetch resolve |
| `LayoutContext` | preferências (ordem, coluna, visibilidade, versões) | ao personalizar |

O *corpo* do widget consome Core/Data; só o *slot* consome Layout. Com key estável
e `memo` no renderer, **reordenar move a instância em vez de desmontá-la**: nenhum
effect roda de novo, nenhum fetch se repete, e o estado interno (nota meio
digitada, timer rodando) sobrevive.

**As versões vivem no banco; qual delas abre, no navegador.** `DashboardLayout`
guarda uma linha por organização com o conjunto de versões — elas são
**compartilhadas**, que é o que faz sentido quando a versão se chama «Robson» e
quem precisa vê-la é o Jhonattan. Já *qual versão abre* é preferência de quem
está olhando e mora num cookie (`home-view`), não no banco: assim o Robson no
computador dele e o Jhonattan no dele abrem em versões diferentes sem brigar.

Cookie e não `localStorage` por um motivo concreto: o servidor precisa saber qual
versão renderizar no primeiro paint. Com a escolha só no `localStorage`, quem
usa a segunda versão veria a primeira piscar em **todo** acesso.

Tudo isso continua atrás da mesma interface (`DashboardPreferencesRepository`),
que foi o que permitiu trocar `localStorage` por banco sem tocar em um componente
de widget. A implementação de produção
(`createServerDashboardPreferences`) tem três propriedades que a UI depende:

| Propriedade | Por quê |
|---|---|
| Escrita **otimista** | arrastar um card não pode esperar ida e volta de rede; o PUT vai depois |
| Escritas **agrupadas** (350 ms) | três arrastos seguidos viram um PUT com o estado final |
| `revision` **compare-and-set** | duas pessoas arrastando ao mesmo tempo: a segunda escrita volta 409 e **adota** o que está valendo, em vez de apagar o trabalho da primeira em silêncio |

Falha de rede **volta ao último estado confirmado** e avisa: deixar na tela uma
mudança que não foi salva seria mentir. E há uma importação única do
`localStorage` da época anterior — banco vazio, o local sobe inteiro; banco com
conteúdo, sobem só as versões cujo **nome** ainda não existe lá.

Toda leitura passa por `normalizeDashboardPreferences`: storage corrompido, widget
que saiu do registry ou coluna inválida não quebram a Home.

---

## O que cada widget carrega

`core` = vem do snapshot de servidor (passo 3). `batch` = request único do passo 5.
`isolated` = rota própria, disparada por viewport. `local` = só `localStorage`.
`server-island` = RSC em `<Suspense>`.

Lista longa segue o padrão **prévia + "Ver todos"**: o carregamento traz só o
teto de exibição mais o total, e a lista completa sai de uma rota própria quando o
usuário clica. O estado expandido é efêmero de propósito — persistir traria a
lista grande de volta em todo acesso e desfaria a economia.

| Widget | Fonte | Custo por carregamento | Quem produz o dado |
|--------|-------|------------------------|--------------------|
| **Precisa da sua atenção** (faixa) | `core` | zero — é derivação pura (`home-attention.ts`) do snapshot | nada próprio |
| **Primeiros passos** (faixa) | `core` | 2 counts (`Product`, `DreMonthSnapshot`) | — |
| **Vendas** | `server-island` | 1 chamada ML (`fetchMe`), já paga pelo header | ML, ao vivo |
| **Compras** | `core` | 1 query (`ReplenishmentCycle` não-concluídos) — **compartilhada com Full** | kanban de reposição |
| **Full** | `core` | — (mesma query de Compras) | kanban de envios |
| **Resultado do mês** | `batch` (`finance`) | 3 queries via `loadDreYearView(lean)` | sync do DRE (ver abaixo) |
| **Saúde do catálogo** | `core` | 2 queries (`groupBy` de produtos + count de anúncios ativos) | cadastro + sync de anúncios |
| **Pendências do sistema** | `core` | 5 queries (3 de pendências + 2 de poll do catálogo) | crons e importações |
| ↳ dizem **quais meses** | — | zero: a leitura de conciliações devolve os meses em vez de um `count`, e os campos já estavam no índice | — |
| **Catálogo perdendo** | `core` | 2 queries: as **5 piores** linhas (ordenadas pelo gap no banco) + um `count` | **cron de catálogo** — zero ML na Home |
| **Abaixo do PMA** | `isolated` | 1 query + `⌈N/20⌉ + N` **chamadas ML** (N = produtos com PMA) | ML, ao vivo |
| **Promoções terminando** | `isolated` | `⌈A/50⌉ + ⌈A/20⌉ + O + P` **chamadas ML** | ML, ao vivo |
| **Onde você vai trabalhar hoje** | `local` | zero rede | o próprio navegador |
| **Notas rápidas** | `local` | zero rede | o próprio navegador |
| **Foco** | `local` | zero rede | o próprio navegador |
| **Atalhos** (off por default) | `local` | zero rede, e o código entra por `dynamic()` | — |

Legenda de promoções: `A` = anúncios ativos, `O` = ativos próprios (não-catálogo),
`P` = dos próprios, quantos têm promoção.

### Como a invisibilidade é expressa

Não é cosmético, é onde está a economia:

- `core` / `local` / `server-island`: o dado já está presente de graça, então o
  widget escondido é **renderizado e oculto por CSS**. Desmontar não economiza
  nada e manter montado deixa o diff de hidratação só de atributo.
- `batch` / `isolated`: o widget escondido **não é renderizado**, e o client nem
  manda a chave dele. É aí que o request deixa de existir.

---

## Resultado do mês, em detalhe

É a pergunta que mais aparece, então vale separado. **Não há cache**: a Home lê do
banco a cada acesso. O que não acontece na Home é o **cálculo** — ele já aconteceu.

1. O sync do DRE (manual ou cron) calcula o mês a partir dos pedidos da ML e grava
   um `DreMonthSnapshot` por mês, com o resultado inteiro num `payload` jsonb.
2. A Home lê esses snapshots do ano. O payload completo de um mês passa de **300 KB
   em texto**, então a leitura da Home usa `leanSnapshots`: um `jsonb_build_object`
   projeta só os campos de totais no próprio Postgres, e os ~3 MB por acesso viram
   **~13 KB**. `pg_column_size` engana aqui — ele mostra o valor comprimido em
   disco, não o que atravessa a rede.
3. `resolveHomeWidgetData` estreita de novo no servidor: o card recebe os 5 totais
   do último mês sincronizado mais duas séries de 12 pontos pro gráfico.
4. O modo lean também **pula três leituras** que só alimentam avisos da tela do
   DRE (`fullReportSourced`, `pendingReconciliation*`) — duas delas proporcionais
   ao volume de envios. São as 6 queries originais virando 3. O que garante que
   isso é seguro é o tipo `HomeFinanceSlice`: 14 campos, nenhum derivado dessas
   leituras, então o compilador recusaria o contrário.

Os totais saem **idênticos** aos da tela do DRE (há teste comparando os dois
caminhos) — o lean só não alimenta os drill-downs de auditoria, que a Home não
mostra.

"Último mês sincronizado" é o mais recente **com sync**, não o mês corrente: no dia
1º o mês atual ainda não tem nada e o card ficaria zerado.

---

## Invariantes

Quebrar qualquer uma destas encarece a página mais acessada do produto:

1. **Nada que chame o Mercado Livre entra no snapshot de servidor.** ML vira widget
   `isolated`, com rota própria e disparo por viewport.
2. **Nada que passe de ~1,5s entra na rota de batch.** Ela é um request só, então a
   chave mais lenta trava as outras. A correção pra uma chave lenta é dividir a
   chave, não aumentar o timeout — a rota não tem `maxDuration` de propósito.
3. **Contagem sozinha deixa o usuário perdido.** Um sinal que diz «5 conciliações
   de DRE pendentes» sem dizer *onde* não é acionável. Quando o dado que nomeia o
   problema está no mesmo índice que a contagem (ou já na mão, como em
   `dreMonths`), trazê-lo é de graça — `formatDreMonthList` é o formatador único
   dessas listas. E o destino do link tem que mostrar a mesma coisa: informar na
   Home e não marcar no DRE só move o beco sem saída de lugar.
4. **Leitura de lista precisa de teto, e o teto precisa de ordenação no banco.**
   O card mostra 5 linhas (`HOME_WIDGET_LIST_CAP`); trazer mil pra mostrar cinco é
   egress e payload de RSC jogados fora. Mas cortar sem ordenar **pelo mesmo
   critério que a UI usa** troca as 5 piores por 5 quaisquer — regressão de dado
   pior que o custo. Quando o critério é expressão entre colunas (o caso do gap de
   catálogo), a ordenação desce pro SQL. Contagem para badge vem de `count`
   separado, nunca de `rows.length`.
5. **Memo de loader é por chamada, nunca de módulo.** Em escopo de módulo viraria
   cache cross-request e vazaria dado de um tenant pro próximo. Qualquer cache que
   entre aqui tem que ser chaveado por `organizationId`.
6. **`sellerId` vem só de `auth.ctx.userId`.** `TaxReportMonthSnapshot` é escopada
   por `sellerId` e está **fora** do tenant guard, então um `sellerId` vindo da
   query não seria pego por nada.
7. **O registry é só metadado.** Nada de componente, `prisma` ou `server-only` —
   ele é importado por RSC, route handler, componente client e teste node.

---

## Custos conhecidos e o que fazer quando apertar

### Chamadas ML por acesso

Medido numa org com 40 anúncios ativos (11 próprios) e 2 PMAs: **~20 chamadas**
(promoções) + **~3** (PMA). O número escala com o catálogo do seller: um seller com
200 anúncios próprios passa de **250 chamadas por abertura da Home**.

O rate limit da ML é **por Client ID**, compartilhado por todos os tenants
([saas-scale-triggers.md](saas-scale-triggers.md)) — então isso é noisy-neighbor
real: a Home de um seller grande pode throttlar os outros. E `fetchWithRetry`
tenta 3× com backoff em 429, o que sob throttling **amplifica** a carga em vez de
reduzi-la.

O caminho já mapeado, em ordem de custo/benefício:

1. **Orçamento de tempo** em `loadPromotionSummary`: parar a varredura ao passar de
   N segundos e devolver parcial com aviso. Hoje, sob 429, a rota pode consumir os
   300s de `maxDuration` inteiros e falhar no fim.
2. **Não repetir em 429** nesse caminho (`maxAttempts: 1`): o retry ajuda num sync
   pontual, não numa varredura de centenas de itens.
3. **Cron 2×/dia gravando numa tabela** — o padrão que `catalogo-perdendo` já usa, e
   que custa ~650 B e **zero** chamada ML por acesso. Corta ~80%.
   Cron de hora em hora seria **pior** que ao vivo.
4. `defaultVisible: false` em promoções, deixando o seller ligar se quiser.

### Egress de banco

O default da Home custa ~25 KB de egress. O que já está resolvido e **não pode
regredir**: a projeção lean do DRE (3 MB → 13 KB) e o `select` estreito nos
snapshots de pendências (`payload` de mês inteiro fora do caminho).

### Pontos de atenção abertos

| Item | Impacto |
|------|---------|
| Índices compostos ausentes | `Listing(organizationId, mlStatus)`, `Listing(organizationId, catalogStatus)`, `Product(organizationId, needsCostReview)`, `CatalogCompetitionPollRun(organizationId, ranAt desc)` — hoje só existe `[organizationId]`, então o filtro cai no heap |
| Zero cache no caminho de dado | decisão consciente (dashboard quer dado fresco), mas um micro-cache de 30–60s por org seria o lever mais barato se o banco apertar |
