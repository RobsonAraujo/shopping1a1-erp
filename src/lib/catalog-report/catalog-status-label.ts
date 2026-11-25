/**
 * Rótulos do status de catálogo, sem dependência de servidor (usado nas
 * telas cliente e reexportado por `catalog-competition.ts`).
 *
 * `unknown` é, na prática, o `not_listed` do ML (`reason: item_not_opted_in`):
 * o anúncio existe mas o ML não o coloca na disputa do catálogo. `null` é
 * anúncio que o poll ainda não leu.
 */
export function catalogStatusLabel(status: string | null): string {
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  if (status === "shared") return "Compartilhando";
  if (status === null) return "Ainda não lido";
  return "Fora da disputa";
}

/** Explicação curta do status para tooltip; `null` quando o rótulo basta. */
export function catalogStatusHint(status: string | null): string | null {
  if (status === null) return "A coleta de catálogo ainda não leu este anúncio.";
  if (status === "winning" || status === "losing" || status === "shared") return null;
  return "O Mercado Livre não está colocando este anúncio na disputa do catálogo.";
}
