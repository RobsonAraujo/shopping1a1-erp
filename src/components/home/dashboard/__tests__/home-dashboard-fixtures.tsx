import type { HomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";
import { emptyHomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";

export function coreSnapshot(
  overrides: Partial<HomeCoreSnapshot> = {},
): HomeCoreSnapshot {
  return {
    ...emptyHomeCoreSnapshot(),
    onboarding: {
      steps: [
        {
          id: "connect",
          label: "Conectar Mercado Livre",
          description: "",
          href: "/dashboard",
          done: true,
        },
      ],
      allDone: true,
    },
    operations: {
      purchase: { inProgress: 2, final: 3, totalActive: 5 },
      full: { inProgress: 1, final: 1, totalActive: 2 },
      totalActive: 7,
    },
    catalog: {
      productCount: 42,
      needsCostReviewCount: 0,
      activeListingCount: 40,
    },
    catalogPoll: {
      todayCount: 2,
      lastRunAt: "2026-09-24T10:00:00.000Z",
      lastRunSource: "cron",
      timezone: "America/Sao_Paulo",
    },
    pendings: {
      failedInventoryRuns: 0,
      pendingDreImports: 0,
      pendingDreImportMonths: [],
      dreMonths: [{ year: 2026, month: 1, syncedAt: "2026-02-01T00:00:00.000Z" }],
      closedInventoryMonths: [],
      year: 2026,
    },
    ...overrides,
  };
}

/**
 * Faz o `IntersectionObserver` reportar "visível" na hora. O setup de jsdom
 * instala um stub que nunca dispara o callback, então sem isto todo widget
 * diferido (PMA, promoções) fica em branco para sempre no teste — falha
 * silenciosa, não erro.
 */
export function installImmediateIntersectionObserver(): () => void {
  const original = globalThis.IntersectionObserver;

  class ImmediateObserver {
    private callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: ImmediateObserver,
    writable: true,
    configurable: true,
  });

  return () => {
    Object.defineProperty(globalThis, "IntersectionObserver", {
      value: original,
      writable: true,
      configurable: true,
    });
  };
}

/** Deixa microtasks e `next/dynamic` resolverem antes de olhar o DOM. */
export async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
