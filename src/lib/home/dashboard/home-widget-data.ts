import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { formatDreMonthLabel } from "@/lib/mercadolibre/revenue-periods";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import {
  type HomeFinanceSlice,
  type HomeWidgetDataKey,
  type HomeWidgetDataResponse,
  type HomeWidgetDataSlices,
} from "@/lib/home/dashboard/widget-data-keys";

/**
 * Resolve as chaves de dado dos widgets visíveis — o lado servidor do único
 * request de batch da Home.
 *
 * Duas coisas aqui não são negociáveis:
 *
 * 1. **Estreitar no servidor, nas duas pontas.** `loadDreYearView` é chamado
 *    com `leanSnapshots` (o banco devolve o payload projetado, ~3 MB → ~13 KB)
 *    e daqui sai só o que o card mostra. Sem as duas, a Home — que é aberta
 *    toda hora — custaria megabytes de egress por carregamento.
 * 2. **Memo por chamada, nunca de módulo.** Duas chaves podem compartilhar
 *    loader; o memo evita a leitura dupla. Em escopo de módulo ele viraria
 *    cache cross-request e vazaria dado de um tenant pro próximo.
 */

const SERIES_MONTHS = 12;

export type HomeWidgetDataContext = {
  organizationId: string;
  /** ML userId. Vem SÓ de `auth.ctx.userId` — `TaxReportMonthSnapshot` é
   * escopada por sellerId e está fora do tenant guard, então um sellerId
   * vindo do client não seria pego por nada. */
  sellerId: number;
  year: number;
};

/** Memo de uma única chamada: chave lógica → promessa do loader. */
type LoaderMemo = Map<string, Promise<unknown>>;

function memoized<T>(
  memo: LoaderMemo,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = memo.get(key);
  if (existing) return existing as Promise<T>;
  const promise = load();
  memo.set(key, promise);
  return promise;
}

async function resolveFinance(
  ctx: HomeWidgetDataContext,
  memo: LoaderMemo,
): Promise<HomeFinanceSlice> {
  const view = await memoized(memo, `dre:${ctx.year}`, () =>
    // `leanSnapshots`: os totais saem idênticos, mas sem trazer os breakdowns
    // por SKU — ~3 MB de egress por load da Home viram ~8 KB.
    loadDreYearView(ctx.organizationId, ctx.year, { leanSnapshots: true }),
  );

  const resultadoLiquidoSeries: (number | null)[] = Array(SERIES_MONTHS).fill(null);
  const margemPercentSeries: (number | null)[] = Array(SERIES_MONTHS).fill(null);
  let monthsSyncedCount = 0;
  let syncWarningCount = 0;
  let latest: (typeof view.months)[number] | null = null;

  for (const month of view.months) {
    const index = month.month - 1;
    if (index >= 0 && index < SERIES_MONTHS) {
      resultadoLiquidoSeries[index] = month.totals?.resultadoLiquido ?? null;
      margemPercentSeries[index] = month.totals?.margemContribuicaoPercent ?? null;
    }
    if (month.syncedAt) {
      monthsSyncedCount += 1;
      // "último mês sincronizado" = o mais recente com sync, não o mês atual:
      // no dia 1 o mês atual ainda não tem nada e o card ficaria zerado.
      if (!latest || month.month > latest.month) latest = month;
    }
    syncWarningCount += month.syncWarnings.length;
  }

  const totals = latest?.totals ?? null;

  return {
    year: view.year,
    latestMonth: latest?.month ?? null,
    latestMonthLabel: latest ? formatDreMonthLabel(latest.month) : null,
    latestSyncedAt: latest?.syncedAt ?? null,
    totalEntrada: totals?.totalEntrada ?? null,
    margemContribuicao: totals?.margemContribuicao ?? null,
    margemContribuicaoPercent: totals?.margemContribuicaoPercent ?? null,
    lucroOperacional: totals?.lucroOperacional ?? null,
    lucroOperacionalPercent: totals?.lucroOperacionalPercent ?? null,
    resultadoLiquido: totals?.resultadoLiquido ?? null,
    resultadoLiquidoSeries,
    margemPercentSeries,
    monthsSyncedCount,
    syncWarningCount,
  };
}

const RESOLVERS: {
  [K in HomeWidgetDataKey]: (
    ctx: HomeWidgetDataContext,
    memo: LoaderMemo,
  ) => Promise<unknown>;
} = {
  finance: resolveFinance,
};

export async function resolveHomeWidgetData(
  ctx: HomeWidgetDataContext,
  keys: readonly HomeWidgetDataKey[],
): Promise<HomeWidgetDataResponse> {
  // Criado AQUI, por chamada. Em escopo de módulo seria vazamento cross-tenant.
  const memo: LoaderMemo = new Map();
  const data: HomeWidgetDataSlices = {};

  await Promise.all(
    keys.map(async (key) => {
      try {
        const value = await RESOLVERS[key](ctx, memo);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any)[key] = { ok: true, value };
      } catch (e) {
        logServerError(`api/dashboard/widgets:${key}`, e);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any)[key] = {
          ok: false,
          error: apiErrorPayload(e, `${key}_failed`).error,
        };
      }
    }),
  );

  return { resolvedAt: new Date().toISOString(), data };
}
