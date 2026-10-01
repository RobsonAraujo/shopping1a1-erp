"use client";

import {
  buildDefaultDashboardPreferences,
  normalizeDashboardPreferences,
  type DashboardPreferences,
} from "@/lib/home/dashboard/dashboard-preferences";

/**
 * Onde as preferências do dashboard moram. A UI **não sabe** se é banco, API ou
 * memória — só conhece esta interface, e foi ela que permitiu trocar
 * `localStorage` por banco sem mexer em um componente de widget.
 *
 * Produção: `createServerDashboardPreferences()` — versões no banco,
 * compartilhadas pela organização, e qual delas abre num cookie por navegador.
 * Teste: `createMemoryDashboardPreferences()`.
 *
 * `read()` sempre devolve preferências **normalizadas** e com **identidade
 * estável** (é o `getSnapshot` de um `useSyncExternalStore`): dado corrompido,
 * widget que saiu do registry — nada disso pode quebrar a Home.
 */
export type DashboardPreferencesRepository = {
  read(): DashboardPreferences;
  write(next: DashboardPreferences): void;
  subscribe(listener: () => void): () => void;
};

/** Em memória — para testes e para o snapshot de servidor. */
export function createMemoryDashboardPreferences(
  initial?: unknown,
): DashboardPreferencesRepository {
  let current =
    initial === undefined
      ? buildDefaultDashboardPreferences()
      : normalizeDashboardPreferences(initial);
  const listeners = new Set<() => void>();

  return {
    read() {
      return current;
    },
    write(next) {
      current = normalizeDashboardPreferences(next);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
