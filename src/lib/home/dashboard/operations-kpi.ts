/**
 * Fatia de ciclo já concluída, em %. Extraído de
 * `DashboardOperationsSummary` quando aquele componente foi dividido em dois
 * widgets (Compras e Full) — os dois precisam da mesma conta.
 */
export function completedShare(inProgress: number, final: number): number {
  const total = inProgress + final;
  if (total <= 0) return 0;
  return Math.round((final / total) * 100);
}
