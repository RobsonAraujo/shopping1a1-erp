import type { CatalogLosingResult } from "@/lib/home/catalog-losing-data";
import type { OperationsSummaryCounts } from "@/lib/compras/replenishment-cycle";
import type { OnboardingChecklistState } from "@/lib/onboarding/onboarding-checklist";

/**
 * Forma do snapshot de servidor da Home — módulo separado do loader **de
 * propósito**: o provider client e `home-attention.ts` importam estes tipos,
 * e o loader importa `prisma`. Juntos, o registry arrastaria o cliente Prisma
 * pro bundle do browser.
 *
 * Toda data vira string ISO aqui: é a mesma forma que o JSON da rota de
 * batch entrega, então o adapter de cada widget lida com um tipo só.
 *
 * Cada slice é `null` quando a query dela falhou — uma slice quebrada
 * degrada o widget correspondente, nunca a página.
 */

export type HomeCatalogHealth = {
  productCount: number;
  needsCostReviewCount: number;
  activeListingCount: number;
};

export type HomeSuppliersCount = {
  total: number;
  active: number;
};

export type HomeCatalogPollStats = {
  todayCount: number;
  lastRunAt: string | null;
  lastRunSource: string | null;
  timezone: string;
};

export type HomeYearMonth = { year: number; month: number };

export type HomeDreMonthStatus = HomeYearMonth & {
  syncedAt: string | null;
};

export type HomePendings = {
  failedInventoryRuns: number;
  /**
   * Derivado de `pendingDreImportMonths.length` — **nunca** uma segunda
   * contagem. Com duas leituras, o número do pill e a lista de meses poderiam
   * divergir (bastaria uma filtrar por ano e a outra não).
   */
  pendingDreImports: number;
  /** O mês de cada conciliação pendente, **sem filtro de ano** (ver
   * `loadPendings`). No máximo 1 pendente por mês, por invariante do banco. */
  pendingDreImportMonths: HomeYearMonth[];
  /** Só `{year, month, syncedAt}` — nunca o `payload` do snapshot. */
  dreMonths: HomeDreMonthStatus[];
  closedInventoryMonths: HomeYearMonth[];
  /**
   * Ano de referência do snapshot. É o que decide se um rótulo de mês precisa
   * levar o ano.
   *
   * Vem daqui e não de `new Date()` no client por duas razões: mantém a
   * derivação dos sinais de atenção **pura** (testável sem mexer no relógio) e
   * garante que o HTML do servidor bate com o da hidratação na virada do ano.
   */
  year: number;
};

export type HomeCoreSnapshot = {
  onboarding: OnboardingChecklistState | null;
  operations: OperationsSummaryCounts | null;
  /** Prévia + total. A prévia é curta de propósito — ver
   * `CATALOG_LOSING_PREVIEW_LIMIT`. */
  catalogLosing: CatalogLosingResult;
  catalogPoll: HomeCatalogPollStats | null;
  catalog: HomeCatalogHealth | null;
  suppliers: HomeSuppliersCount | null;
  pendings: HomePendings | null;
  /** Nomes das slices que falharam — o widget mostra o aviso no lugar certo. */
  failedSlices: string[];
};

/**
 * O card de Vendas NÃO entra aqui como dado. Ele depende de `fetchMe` (ida ao
 * Mercado Livre) e é entregue à grade como nó de servidor já dentro de um
 * `<Suspense>` — assim continua streamando, em vez de bloquear o TTFB de toda
 * a Home esperando o ML. Ver `sellerCard` em `HomeDashboardProvider`.
 */

export function emptyHomeCoreSnapshot(): HomeCoreSnapshot {
  return {
    onboarding: null,
    operations: null,
    catalogLosing: { rows: [], total: 0 },
    catalogPoll: null,
    catalog: null,
    suppliers: null,
    pendings: null,
    failedSlices: [],
  };
}
