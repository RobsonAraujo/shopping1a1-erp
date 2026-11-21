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
 * - **Full**: disponível + em transferência entre centros do ML + outros não
 *   disponíveis. Tudo isso já está com o ML.
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
  fullTotalQty: number | null;
  fetchedAt: Date | null;
  error: string | null;
};

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
  /** Em transferência entre centros do ML + outros não disponíveis. */
  fullUnavailable: number | null;
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
    fullTotal,
    total: fullTotal == null ? null : ownQty + fullTotal,
    alerts,
  };
}
