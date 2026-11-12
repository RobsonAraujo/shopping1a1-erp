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

export type CatalogPricePoint = CatalogStatusPoint & { sellerPrice: number | null };

/**
 * A última subida de preço feita a partir de "ganhando": o ponto em que o
 * preço passou a ser maior que o do snapshot anterior, que estava ganhando.
 * Serve para o card de perdendo/dividindo dizer "você subiu de X para Y" —
 * quem decide se a subida explica o status de agora é a view (pela data).
 */
export function resolveRecentRaise(
  points: readonly CatalogPricePoint[],
): { from: number; to: number; at: string } | null {
  const known = points
    .filter(
      (point): point is CatalogPricePoint & { sellerPrice: number } =>
        point.status !== "unknown" && point.sellerPrice !== null,
    )
    .slice()
    .sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt));
  for (let i = known.length - 1; i >= 1; i -= 1) {
    const previous = known[i - 1];
    const current = known[i];
    if (previous.status === "winning" && current.sellerPrice > previous.sellerPrice + 0.005) {
      return { from: previous.sellerPrice, to: current.sellerPrice, at: current.snapshotAt };
    }
  }
  return null;
}
