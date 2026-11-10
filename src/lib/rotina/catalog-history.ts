import type { CatalogLiveStatus } from "@/lib/rotina/types";

export type CatalogStatusPoint = {
  status: CatalogLiveStatus;
  snapshotAt: string;
};

/**
 * Desde quando o anúncio está no status atual, pelo histórico de snapshots.
 *
 * O cron grava snapshot na mudança de status, mas também no primeiro poll do
 * dia e em qualquer mudança de preço — então "existe snapshot `losing` hoje" NÃO
 * quer dizer "passou a perder hoje". O que vale é o começo da sequência mais
 * recente com o status atual. `unknown` no meio (falha de leitura do ML) não
 * quebra a sequência: é ignorado.
 */
export function resolveStatusSince(
  points: readonly CatalogStatusPoint[],
  currentStatus: CatalogLiveStatus,
): { since: string | null; truncated: boolean } {
  const known = points
    .filter((point) => point.status !== "unknown")
    .slice()
    .sort((a, b) => b.snapshotAt.localeCompare(a.snapshotAt));

  let since: string | null = null;
  for (const point of known) {
    if (point.status !== currentStatus) {
      return { since, truncated: false };
    }
    since = point.snapshotAt;
  }
  // Acabou o histórico ainda no mesmo status: está assim há mais que a janela.
  return { since, truncated: since !== null };
}
