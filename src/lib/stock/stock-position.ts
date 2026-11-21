/**
 * Os números de um item de estoque — lógica pura, uma fonte só para a tela,
 * o Compras, o Kanban e o fechamento mensal.
 *
 * - **Em casa** (`own`): livro do ERP (entradas − vendas de casa − envios ao
 *   Full ± ajustes).
 * - **Depósito**: o que o ML mostra como estoque no depósito do vendedor
 *   (`seller_warehouse`). O ML desconta sozinho a cada venda de casa.
 * - **Galpão** = Em casa − Depósito: o que ainda não foi separado para venda.
 *   Ninguém lança; sai da conta.
 * - **Full**: à venda + o que ainda não está à venda (em transferência entre
 *   centros do ML, retirada, sem cobertura fiscal…). Tudo isso já está com o
 *   ML. O perdido fica fora.
 * - **Total** = Em casa + Full.
 *
 * Leitura do ML que falhou ou nunca aconteceu vira `null` (a tela mostra
 * "—"), nunca 0 — um 0 falso esconderia estoque.
 */

export type MlPositionInput = {
  depositQty: number | null;
  fullAvailableQty: number | null;
  fullTransferQty: number | null;
  fullOtherQty: number | null;
  fullWithdrawalQty: number | null;
  fullLostQty: number | null;
  fullTotalQty: number | null;
  /** `StockItemMlPosition.fullUnavailableDetail` (JSON); `null` em leitura antiga. */
  fullUnavailableDetail: unknown;
  fetchedAt: Date | null;
  error: string | null;
};

/** Uma parte do Full fora da venda, com o status do ML (`lost` fica fora do total). */
export type FullBreakdownPart = { status: string; quantity: number };

export type StockAlert =
  /** O ML anuncia no depósito mais do que existe em casa: risco de vender sem ter. */
  | "deposit_exceeds_own"
  /** Saiu mais do que entrou: falta lançar entrada ou fazer inventário. */
  | "negative_own"
  /** Não foi possível ler o ML deste item. */
  | "ml_unread";

export type StockPosition = {
  own: number;
  deposit: number | null;
  /** Em casa − Depósito. Negativo quando o depósito do ML passa do Em casa. */
  warehouse: number | null;
  fullAvailable: number | null;
  /** Tudo que está no Full e não está à venda (em transferência, retirada, sem cobertura fiscal…). */
  fullUnavailable: number | null;
  /** O `fullUnavailable` por status do ML, mais o perdido (fora do total). */
  fullBreakdown: FullBreakdownPart[];
  fullTotal: number | null;
  total: number | null;
  alerts: StockAlert[];
};

export function computeStockPosition(input: {
  ownQty: number;
  ml: MlPositionInput | null;
  /** O item tem anúncio Full (sem leitura do Full, o total fica desconhecido). */
  hasFull: boolean;
}): StockPosition {
  const { ownQty, ml, hasFull } = input;
  const mlRead = ml != null && ml.fetchedAt != null && !ml.error;
  const deposit = mlRead ? ml.depositQty : null;
  const fullAvailable = mlRead ? ml.fullAvailableQty : null;
  const fullUnavailable =
    mlRead && (ml.fullTransferQty != null || ml.fullOtherQty != null)
      ? (ml.fullTransferQty ?? 0) + (ml.fullOtherQty ?? 0)
      : null;
  const fullBreakdown = mlRead ? fullBreakdownOf(ml) : [];
  const fullTotal = mlRead
    ? (ml.fullTotalQty ?? (hasFull ? null : 0))
    : hasFull
      ? null
      : 0;

  const alerts: StockAlert[] = [];
  if (!mlRead) alerts.push("ml_unread");
  if (ownQty < 0) alerts.push("negative_own");
  if (deposit != null && deposit > Math.max(ownQty, 0)) alerts.push("deposit_exceeds_own");

  return {
    own: ownQty,
    deposit,
    warehouse: deposit == null ? null : ownQty - deposit,
    fullAvailable,
    fullUnavailable,
    fullBreakdown,
    fullTotal,
    total: fullTotal == null ? null : ownQty + fullTotal,
    alerts,
  };
}

function parseDetail(raw: unknown): FullBreakdownPart[] | null {
  if (!Array.isArray(raw)) return null;
  const parts: FullBreakdownPart[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { status, quantity } = entry as { status?: unknown; quantity?: unknown };
    if (typeof status !== "string" || typeof quantity !== "number" || quantity <= 0) continue;
    parts.push({ status, quantity });
  }
  return parts;
}

/**
 * Quebra do Full fora da venda. Leitura nova traz o status exato do ML;
 * leitura antiga (antes da coluna) cai nos números agrupados: transferência,
 * retirada, perdido e "outro" (o resto).
 */
export function fullBreakdownOf(
  ml: Pick<
    MlPositionInput,
    "fullUnavailableDetail" | "fullTransferQty" | "fullOtherQty" | "fullWithdrawalQty" | "fullLostQty"
  >,
): FullBreakdownPart[] {
  const detail = parseDetail(ml.fullUnavailableDetail);
  if (detail) return detail;
  const withdrawal = ml.fullWithdrawalQty ?? 0;
  const parts: FullBreakdownPart[] = [
    { status: "transfer", quantity: ml.fullTransferQty ?? 0 },
    { status: "withdrawal", quantity: withdrawal },
    { status: "other", quantity: Math.max(0, (ml.fullOtherQty ?? 0) - withdrawal) },
    { status: "lost", quantity: ml.fullLostQty ?? 0 },
  ];
  return parts.filter((p) => p.quantity > 0);
}
