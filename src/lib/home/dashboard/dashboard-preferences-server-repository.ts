"use client";

import {
  HOME_VIEW_COOKIE,
  dashboardPreferencesFromViews,
  type DashboardPreferences,
  type DashboardView,
} from "@/lib/home/dashboard/dashboard-preferences";
import type { DashboardPreferencesRepository } from "@/lib/home/dashboard/dashboard-preferences-repository";

/**
 * O repositório que o produto usa: **versões no banco, qual delas abre no
 * navegador**.
 *
 * Implementa a mesma interface do de `localStorage` — o provider e a UI não
 * sabem a diferença, que era o ponto de ter a interface desde o começo.
 *
 * Três decisões que não são óbvias:
 *
 * 1. **Escrita otimista.** Arrastar um card tem que ser instantâneo, então o
 *    estado em memória muda e avisa os assinantes na hora; o PUT vai depois. Se
 *    o PUT falhar, voltamos ao último estado confirmado e avisamos — o que está
 *    na tela é sempre o que está salvo, nunca um meio-termo silencioso.
 * 2. **Escritas são agrupadas** (`FLUSH_MS`). Três arrastos seguidos viram um
 *    PUT com o estado final, em vez de três.
 * 3. **`read()` devolve identidade estável.** É o `getSnapshot` de um
 *    `useSyncExternalStore`: objeto novo a cada leitura vira laço de render
 *    ("The result of getSnapshot should be cached").
 */

const ENDPOINT = "/api/dashboard/layout";
const FLUSH_MS = 350;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Qual versão abre fica em **cookie**, não em `localStorage`.
 *
 * O servidor precisa desse valor pra renderizar a versão certa no primeiro
 * paint. No `localStorage` ele só existe depois da hidratação, então quem
 * escolheu a segunda versão veria a primeira piscar em **todo** acesso — e é
 * justamente a pessoa pra quem a feature de versões foi feita.
 */
function writeViewCookie(viewId: string): void {
  if (typeof document === "undefined") return;
  // `document.location`, não o global `location` solto: o global não existe em
  // todo ambiente que tem `document` (o jsdom dos testes é um), e ler um global
  // ausente lança em vez de degradar.
  const secure = document.location?.protocol === "https:" ? "; secure" : "";
  document.cookie = `${HOME_VIEW_COOKIE}=${encodeURIComponent(viewId)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

export type ServerDashboardSeed = {
  /** O que a página leu do banco no servidor. Vazio = organização sem linha. */
  views: DashboardView[];
  /** 0 = ainda não existe linha. */
  revision: number;
  /** Cookie `home-view`, lido no servidor. */
  viewId?: string | null;
};

export type ServerDashboardRepository = DashboardPreferencesRepository & {
  /** Revisão confirmada pelo servidor — usada pela importação única. */
  revision(): number;
  /** Só pra teste: resolve quando não há escrita pendente. */
  flush(): Promise<void>;
};

export function createServerDashboardPreferences(
  seed: ServerDashboardSeed,
  options?: {
    /** Injetável no teste. */
    fetchImpl?: typeof fetch;
    onError?: (message: string) => void;
  },
): ServerDashboardRepository {
  const doFetch = options?.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const notifyError = options?.onError ?? (() => {});

  let current = dashboardPreferencesFromViews(seed.views, seed.viewId);
  let confirmedViews = current.views;
  let revision = seed.revision;

  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setCurrent(next: DashboardPreferences): void {
    current = next;
    emit();
  }

  async function send(): Promise<void> {
    const sending = current.views;
    try {
      const res = await doFetch(ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ views: sending, revision }),
      });

      if (res.status === 409) {
        // Outra pessoa (ou outra aba) gravou antes. Adotamos o que está valendo
        // em vez de sobrescrever — é o inverso de perder o trabalho dela.
        const body = (await res.json()) as { views: unknown; revision: number };
        revision = body.revision;
        confirmedViews = dashboardPreferencesFromViews(body.views, null).views;
        setCurrent(
          dashboardPreferencesFromViews(confirmedViews, current.defaultViewId),
        );
        notifyError(
          "O início foi alterado em outro lugar. Carregamos o layout mais recente.",
        );
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = (await res.json()) as { revision: number };
      revision = body.revision;
      confirmedViews = sending;
    } catch {
      // Volta ao último estado confirmado: nada ficou salvo, então deixar a tela
      // mostrando a mudança seria mentir.
      setCurrent(
        dashboardPreferencesFromViews(confirmedViews, current.defaultViewId),
      );
      notifyError("Não foi possível salvar o layout do início.");
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      inFlight = (inFlight ?? Promise.resolve()).then(send);
    }, FLUSH_MS);
  }

  return {
    read() {
      return current;
    },
    write(next) {
      // **Sem normalizar aqui, de propósito.** O normalizador monta um array de
      // versões novo a cada chamada, o que apagaria a única informação que
      // interessa neste ponto: se as versões mudaram *de verdade*. As funções
      // puras (`moveWidgetToColumn`, `setDefaultView`…) devolvem o mesmo array
      // por identidade quando não mudam nada, e quem normaliza de verdade é o
      // servidor, no `saveDashboardLayout` — que é o filtro que vale.
      const normalized = next;
      const viewsChanged = normalized.views !== current.views;
      const defaultChanged = normalized.defaultViewId !== current.defaultViewId;
      if (!viewsChanged && !defaultChanged) return;

      // Qual versão abre é só deste navegador: vai pro cookie e **não** gera PUT.
      if (defaultChanged) writeViewCookie(normalized.defaultViewId);

      setCurrent(normalized);
      if (viewsChanged) schedule();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    revision() {
      return revision;
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        inFlight = (inFlight ?? Promise.resolve()).then(send);
      }
      await inFlight;
    },
  };
}
