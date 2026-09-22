# Estoque — fechamento mensal (Histórico)

Relatório de saldo em estoque por SKU (galpão + Mercado Livre + a caminho no Full) com **fechamento mensal congelado**, pensado pra ser confiável o suficiente pra mandar pra contabilidade — ao contrário do relatório ao vivo antigo (removido), que reconstruía o passado a partir do estoque de "hoje" e quebrava sempre que alguém ajustava o galpão depois da data escolhida.

## Estrutura

```
src/lib/inventory/
  inventory-stock-report.ts         # Pipeline de agregação por SKU (merge, custo, totais) — puro, sem I/O
  inventory-stock-report-pdf.ts     # Export PDF
  inventory-stock-report-excel.ts   # Export Excel
  inventory-month-snapshot.ts       # Builder do snapshot + cron + disparo manual (I/O: API do ML + DB)
  inventory-month-snapshot-report.ts # Lê o snapshot já salvo e adapta pro pipeline de agregação acima
```

UI: `src/app/dashboard/inventory/historico/` + `src/components/inventory/InventoryHistory*` (aba "Relatório do mês" e aba "Comparar mês a mês", por ano).

## Regra central do cron: não existe "detectar o último dia do mês"

`resolveInventorySnapshotTargetMonth` (`inventory-month-snapshot.ts`) sempre aponta pro mês **anterior** ao mês corrente — nunca "hoje". Isso usa `defaultStockReportSnapshotDate` (`inventory-stock-report.ts`), que calcula dias-no-mês com o idiom nativo `new Date(year, month, 0).getDate()` — cobre fevereiro (bissexto incluso), meses de 30 e 31 dias, sem nenhum hardcode.

Consequência prática: o cron **não precisa rodar no dia 28/29/30/31** nem descobrir quantos dias o mês tem. Basta rodar em qualquer dia do mês seguinte que o mês anterior já está 100% fechado.

## Schedule externo (cron-job.org)

Não tem `vercel.json`/Vercel Cron neste projeto — agendamento é 100% externo, mesmo padrão do cron de `catalog-competition`.

- **`0 6 1-2 * *`** (UTC) = 03:00 em `America/Sao_Paulo`, dias 1 e 2 de cada mês.
- Dia 1 fecha tudo. Dia 2 é só rede de segurança: `ensurePendingSnapshotRuns` usa `createMany({ skipDuplicates: true })`, e a busca por runs `pending`/`failed` não acha nada quando o dia 1 já terminou — vira no-op automático. Só reprocessa organizações que falharam no dia 1 (token do ML expirado, etc.).
- Autenticação: bearer `CRON_SECRET` (`authorizeBearerSecret`), igual aos demais crons.

## `source`: `auto` vs `manual`

- **`manual`**: disparado pelo usuário (botão "Gerar snapshot de hoje" na tela de Histórico, `triggerManualInventoryMonthSnapshot`) — sempre mira o **mês corrente, ainda aberto** (`currentInventorySnapshotMonth`). Serve pra quem precisa de um corte antes do fechamento oficial (ex.: mandar pra contabilidade no meio do mês).
- **`auto`**: o cron. Quando esse mês finalmente vira "o último mês fechado" e o cron chega nele, `ensurePendingSnapshotRuns` reabre (`status -> pending`) qualquer run `manual` já `done` daquele mês — o fechamento oficial sempre sobrescreve o valor manual e muda `source` pra `auto`. Um snapshot manual é sempre provisório, nunca definitivo.

## Idempotência

- **Dado**: `upsert` por `[organizationId, mlItemId, year, month]` em `InventoryStockMonthSnapshot`.
- **Fila**: `InventoryMonthSnapshotRun` com `status` (`pending`/`in_progress`/`done`/`failed`) + `attempts` (máx. 5, `MAX_ATTEMPTS`) — só reprocessa o que não está `done`.
- `InventoryMonthSnapshotRun` fica **fora** de `TENANT_SCOPED_MODELS` de propósito (`db-tenant-guard.ts`): é a própria tabela de fan-out cross-tenant do cron, precisa varrer todas as organizações sem filtro pra decidir o próximo lote (mesmo caso de `OrganizationMlSeller`).

## O que entra no snapshot

- Todos os anúncios operacionais dos seller(s) ML da organização (uma org pode ter mais de 1 seller — `OrganizationMlSeller` é 1:N).
- Kits excluídos (`isKitItem`) — kit não é estoque físico real.
- Produto inativado no ERP **não é excluído** (ao contrário da tela ao vivo de Estoque) — aqui é histórico/auditoria, como DRE/Lucratividade: um produto que estava listado no ML naquele mês não perde custo só por ter sido desativado depois.
- Custo e NCM **congelados** no momento do fechamento (`loadStockReportProductsByMlItemId`) — não mudam se o cadastro do produto for editado depois.
- `mlStockOnTheWay` (estoque Full em processamento, "a caminho") **é** capturado aqui via `enrichItemsWithFulfillmentStock` — mesma fonte que a tela ao vivo usa. A tela ao vivo faz essa busca via streaming (1 chamada ML por item Full é cara demais pra rodar em toda visita à página); o snapshot busca direto porque só roda 1x por organização por mês.

## Timezone e data

`reportsConfig.catalogCompetitionTimezone` (`America/Sao_Paulo`) em tudo — nunca UTC direto. Helpers em `src/lib/report-timezone.ts` (`getZonedParts`, `zonedLocalToUtc`) construídos sobre `Intl.DateTimeFormat` nativo. **Sem** date-fns/dayjs/luxon no projeto.

## Limitações conhecidas

- `CRON_BATCH_SIZE = 5` organizações por execução (`route.ts`) — se a base crescer bem além disso, um mês recém-fechado pode levar mais de 1 dia pra todo mundo ser processado (dia 1 processa 5, dia 2 processa o resto). Funciona, só demora mais; reavaliar o batch size se isso virar problema.
- Sem alerta automático se um run ficar `failed` além de `MAX_ATTEMPTS` — hoje só fica visível olhando a tabela (Prisma Studio) ou o log de erro (`logServerError`).
- Ajustes manuais (NF não entregue, ajuste +/−) e merge de SKU no "Relatório do mês" são só locais à sessão do navegador — não persistem, servem só pra exportar PDF/Excel corrigido na hora.

## Multi-tenant

`InventoryStockMonthSnapshot` é tenant-scoped normal (`organizationId` obrigatório). `InventoryMonthSnapshotRun` é a exceção documentada acima. Convenções gerais: [`docs/architecture/tenant-data-model.md`](../../../docs/architecture/tenant-data-model.md).

## Testes

```bash
node --import tsx --test src/lib/inventory/**/*.test.ts
```
