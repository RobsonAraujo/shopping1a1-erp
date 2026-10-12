import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  getEditableLineAmount,
  isReconciliationGovernedLineKey,
  type DreEditableLineKey,
  type DreMonthSnapshotPayload,
} from "@/lib/dre/dre-calculations";
import { dreEditableLineLabel } from "@/lib/dre/dre-table-rows";
import type {
  DreReconciliationLineDiff,
  DreReconciliationLineMatch,
  ReconciliationLineAggregation,
} from "@/lib/dre/reconciliation/types";

export type ReconciliationComparison = {
  /** Linhas em que a planilha muda o valor atual do DRE. */
  diff: DreReconciliationLineDiff[];
  /** Linhas governadas pela planilha que já conferem com o DRE. */
  matched: DreReconciliationLineMatch[];
};

/**
 * Compara a planilha agregada com o snapshot atual, só nas linhas que a
 * conciliação governa. `candidateKeys` restringe ainda mais (revisão de import
 * antigo: só o que o usuário aceitou na época).
 */
export function compareReconciliation(
  currentPayload: DreMonthSnapshotPayload | null,
  aggregation: ReconciliationLineAggregation,
  candidateKeys?: readonly DreEditableLineKey[],
): ReconciliationComparison {
  const allowed = candidateKeys ? new Set(candidateKeys) : null;
  const keys = new Set<DreEditableLineKey>(
    Object.keys(aggregation.amounts) as DreEditableLineKey[],
  );
  const diff: DreReconciliationLineDiff[] = [];
  const matched: DreReconciliationLineMatch[] = [];
  for (const lineKey of keys) {
    if (!isReconciliationGovernedLineKey(lineKey)) continue;
    if (allowed && !allowed.has(lineKey)) continue;
    const proposedAmount = roundMoney(aggregation.amounts[lineKey] ?? 0);
    const currentAmount = currentPayload
      ? getEditableLineAmount(currentPayload, lineKey)
      : 0;
    const label = dreEditableLineLabel(lineKey);
    if (Math.abs(proposedAmount - currentAmount) < 0.005) {
      matched.push({ lineKey, label, amount: proposedAmount });
      continue;
    }
    diff.push({
      lineKey,
      label,
      currentAmount,
      proposedAmount,
      delta: roundMoney(proposedAmount - currentAmount),
    });
  }
  diff.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  matched.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return { diff, matched };
}

export function buildReconciliationDiff(
  currentPayload: DreMonthSnapshotPayload | null,
  aggregation: ReconciliationLineAggregation,
  candidateKeys?: readonly DreEditableLineKey[],
): DreReconciliationLineDiff[] {
  return compareReconciliation(currentPayload, aggregation, candidateKeys).diff;
}

/**
 * Linhas que ficam governadas pela planilha ao confirmar: as que já conferiam
 * mais as divergentes que o usuário aceitou. Divergência desmarcada fica com o
 * valor atual (API/manual) e fora da conciliação.
 */
export function resolveReconciledLineKeys(
  comparison: ReconciliationComparison,
  acceptedLineKeys: readonly DreEditableLineKey[],
): DreEditableLineKey[] {
  const accepted = new Set(acceptedLineKeys);
  return [
    ...comparison.matched.map((row) => row.lineKey),
    ...comparison.diff
      .filter((row) => accepted.has(row.lineKey))
      .map((row) => row.lineKey),
  ];
}
