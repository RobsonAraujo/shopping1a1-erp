/**
 * Ordem manual dos cards dentro de uma coluna do Kanban — o mesmo modelo do
 * Trello: cada card tem um número (`ReplenishmentCycle.position`), a coluna
 * mostra em ordem crescente, e soltar um card entre dois outros grava o ponto
 * médio entre eles. Um movimento = 1 linha escrita, sem renumerar ninguém.
 *
 * O preço do ponto médio é a precisão: soltar repetidamente no mesmo vão
 * divide o espaço ao meio a cada vez. `renormalizedPositions` detecta quando o
 * vão ficou pequeno demais e devolve uma numeração nova da coluna inteira,
 * mantendo a ordem — o servidor aplica isso na mesma transação do movimento.
 *
 * Lógica pura, usada pelo client (posição otimista) e pelo servidor.
 */

/** Espaço entre dois cards vizinhos numa coluna recém-numerada. */
export const KANBAN_POSITION_GAP = 1024;

/** Abaixo disso, dois valores distintos vizinhos pedem renumeração. Com
 * `GAP = 1024`, isso só acontece depois de ~30 drops seguidos no mesmo vão —
 * bem antes do double perder precisão de fato (~50). */
const MIN_DISTINCT_GAP = 1e-6;

/**
 * Posição para um card que vai ficar entre `before` (o card de cima) e
 * `after` (o de baixo). Sem vizinho de um dos lados, abre um `GAP` além do
 * vizinho que existe; coluna vazia começa em 0.
 */
export function positionBetween(before?: number | null, after?: number | null): number {
  const hasBefore = before != null && Number.isFinite(before);
  const hasAfter = after != null && Number.isFinite(after);
  if (hasBefore && hasAfter) return (before + after) / 2;
  if (hasAfter) return after - KANBAN_POSITION_GAP;
  if (hasBefore) return before + KANBAN_POSITION_GAP;
  return 0;
}

/** Posição para entrar no topo de uma coluna com estas posições (qualquer ordem). */
export function positionAtTop(positions: readonly number[]): number {
  return positions.length === 0 ? 0 : positionBetween(null, Math.min(...positions));
}

/** Posição para entrar no fim de uma coluna com estas posições (qualquer ordem). */
export function positionAtEnd(positions: readonly number[]): number {
  return positions.length === 0 ? 0 : positionBetween(Math.max(...positions), null);
}

/**
 * Se algum par de valores **distintos** vizinhos estiver perto demais,
 * devolve o mapa `valor antigo → valor novo` que renumera a coluna inteira
 * (`GAP, 2·GAP, 3·GAP…`) mantendo a ordem; senão `null` (nada a fazer).
 *
 * Valores iguais continuam iguais depois da renumeração: em Compras, todos os
 * ciclos de um fornecedor numa coluna compartilham a mesma posição (o card do
 * fornecedor é um agregado deles), e isso não pode ser confundido com um vão
 * pequeno nem separado pela renumeração.
 */
export function renormalizedPositions(positions: readonly number[]): Map<number, number> | null {
  const distinct = [...new Set(positions)].sort((a, b) => a - b);
  let crowded = false;
  for (let i = 1; i < distinct.length; i += 1) {
    if (distinct[i] - distinct[i - 1] < MIN_DISTINCT_GAP) {
      crowded = true;
      break;
    }
  }
  if (!crowded) return null;
  return new Map(distinct.map((value, index) => [value, (index + 1) * KANBAN_POSITION_GAP]));
}
