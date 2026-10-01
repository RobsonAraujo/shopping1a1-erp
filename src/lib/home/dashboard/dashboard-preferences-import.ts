"use client";

import {
  getPersistedJsonValue,
  setPersistedJsonValue,
} from "@/hooks/use-persisted-json";
import {
  DASHBOARD_PREFERENCES_STORAGE_KEY,
  mergeDashboardViews,
  normalizeDashboardPreferences,
} from "@/lib/home/dashboard/dashboard-preferences";
import type { ServerDashboardRepository } from "@/lib/home/dashboard/dashboard-preferences-server-repository";

/**
 * Importação **única** do layout que ficou no `localStorage` antes de as versões
 * passarem a morar no banco.
 *
 * Sem isto, o deploy que ligou o banco apagaria da cara do usuário as versões
 * que ele acabou de montar — a Home voltaria ao layout padrão e pareceria um
 * bug, não uma migração.
 *
 * Duas regras:
 *
 * - **Banco vazio:** o local sobe inteiro, inclusive a versão padrão
 *   personalizada.
 * - **Banco com conteúdo:** só sobem as versões cujo **nome** ainda não existe
 *   lá. Quem carrega depois não pode sobrescrever em silêncio o layout que já
 *   está valendo pra todos (ver `mergeDashboardViews`).
 *
 * A chave antiga é **renomeada, não apagada**: se algo der errado, o layout
 * anterior ainda está no navegador.
 */

const IMPORTED_KEY = `${DASHBOARD_PREFERENCES_STORAGE_KEY}.imported`;

/** Guarda contra o ciclo duplo do StrictMode na mesma aba. */
let done = false;

export function importLocalDashboardPreferences(
  repo: ServerDashboardRepository,
): void {
  if (done || typeof window === "undefined") return;

  const raw = getPersistedJsonValue<unknown>(
    DASHBOARD_PREFERENCES_STORAGE_KEY,
    null,
  );
  if (raw === null) {
    done = true;
    return;
  }

  const local = normalizeDashboardPreferences(raw);
  const server = repo.read();

  const merged =
    repo.revision() === 0
      ? { ...server, views: local.views }
      : mergeDashboardViews(server, local);

  // A versão que esta pessoa abria continua sendo a dela — vira cookie no write.
  const defaultViewId = merged.views.some(
    (view) => view.id === local.defaultViewId,
  )
    ? local.defaultViewId
    : merged.defaultViewId;

  if (merged !== server || defaultViewId !== server.defaultViewId) {
    repo.write({ ...merged, defaultViewId });
  }

  setPersistedJsonValue(IMPORTED_KEY, raw);
  window.localStorage.removeItem(DASHBOARD_PREFERENCES_STORAGE_KEY);
  done = true;
}

/** Só pra teste: reabilita a importação nesta aba. */
export function resetDashboardImportGuard(): void {
  done = false;
}
