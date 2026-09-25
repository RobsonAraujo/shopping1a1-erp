"use client";

import {
  getPersistedJsonValue,
  setPersistedJsonValue,
  subscribeToPersistedJson,
} from "@/hooks/use-persisted-json";
import {
  DASHBOARD_PREFERENCES_STORAGE_KEY,
  buildDefaultDashboardPreferences,
  normalizeDashboardPreferences,
  type DashboardPreferences,
} from "@/lib/home/dashboard/dashboard-preferences";

/**
 * Onde as preferências do dashboard moram. A UI **não sabe** se é
 * `localStorage`, API ou banco — só conhece esta interface.
 *
 * V1: `createLocalStorageDashboardPreferences()`.
 * Depois: `createApiDashboardPreferences()` chaveado por
 * `(organizationId, userId)`. O sistema de widgets não muda.
 *
 * `read()` sempre devolve preferências **normalizadas**: storage corrompido,
 * widget que saiu do registry, tamanho que deixou de ser suportado — nada
 * disso pode quebrar a Home.
 */
export type DashboardPreferencesRepository = {
  read(): DashboardPreferences;
  write(next: DashboardPreferences): void;
  subscribe(listener: () => void): () => void;
};

/** Sentinela: distingue "ainda não li" de um valor lido que é `null`. */
const UNREAD = Symbol("unread");

export function createLocalStorageDashboardPreferences(): DashboardPreferencesRepository {
  // `read()` é o `getSnapshot` do `useSyncExternalStore`, que exige o **mesmo
  // objeto** enquanto nada mudou. `normalizeDashboardPreferences` devolve um
  // objeto novo a cada chamada, então normalizar direto no `read` fazia o React
  // ver estado novo em todo render: "The result of getSnapshot should be cached
  // to avoid an infinite loop".
  //
  // `getPersistedJsonValue` já devolve identidade estável enquanto o texto no
  // localStorage não muda (ele cacheia por string crua), então basta memoizar a
  // normalização em cima dessa identidade.
  let lastInput: unknown = UNREAD;
  let lastOutput: DashboardPreferences = buildDefaultDashboardPreferences();

  return {
    read() {
      const stored = getPersistedJsonValue<unknown>(
        DASHBOARD_PREFERENCES_STORAGE_KEY,
        null,
      );
      if (lastInput !== UNREAD && stored === lastInput) return lastOutput;
      lastInput = stored;
      lastOutput = normalizeDashboardPreferences(stored);
      return lastOutput;
    },
    write(next) {
      // Normaliza na escrita também: garante que o que está no disco já é
      // válido e que `read()` volta idêntico (evita render extra na releitura).
      setPersistedJsonValue(
        DASHBOARD_PREFERENCES_STORAGE_KEY,
        normalizeDashboardPreferences(next),
      );
    },
    subscribe(listener) {
      return subscribeToPersistedJson(
        DASHBOARD_PREFERENCES_STORAGE_KEY,
        listener,
      );
    },
  };
}

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
