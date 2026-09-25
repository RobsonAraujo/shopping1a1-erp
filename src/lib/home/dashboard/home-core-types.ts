import type { CatalogLosingRow } from "@/lib/home/catalog-losing-data";
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

export type HomeDreMonthStatus = {
  year: number;
  month: number;
  syncedAt: string | null;
};

export type HomePendings = {
  failedInventoryRuns: number;
  pendingDreImports: number;
  /** Só `{year, month, syncedAt}` — nunca o `payload` do snapshot. */
  dreMonths: HomeDreMonthStatus[];
  closedInventoryMonths: { year: number; month: number }[];
};

export type HomeCoreSnapshot = {
  onboarding: OnboardingChecklistState | null;
  operations: OperationsSummaryCounts | null;
  catalogLosing: CatalogLosingRow[];
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
    catalogLosing: [],
    catalogPoll: null,
    catalog: null,
    suppliers: null,
    pendings: null,
    failedSlices: [],
  };
}
