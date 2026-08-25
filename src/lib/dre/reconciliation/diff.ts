import { roundMoney } from "@/lib/financial-margin";
import {
  getEditableLineAmount,
  type DreEditableLineKey,
  type DreMonthSnapshotPayload,
} from "@/lib/dre/dre-calculations";
import { dreEditableLineLabel } from "@/lib/dre/dre-table-rows";
import type {
  DreReconciliationLineDiff,
  ReconciliationLineAggregation,
} from "@/lib/dre/reconciliation/types";

const SKIPPED_RECONCILIATION_KEYS = new Set<DreEditableLineKey>([
  "productCostErp",
  "taxErp",
  "adsCost",
  "fullShippingMl",
  "revenueMl",
  "cancelledSalesMl",
  "partialReturnsMl",
]);

export function buildReconciliationDiff(
  currentPayload: DreMonthSnapshotPayload | null,
  aggregation: ReconciliationLineAggregation,
): DreReconciliationLineDiff[] {
  const keys = new Set<DreEditableLineKey>(
    Object.keys(aggregation.amounts) as DreEditableLineKey[],
  );
  const diffs: DreReconciliationLineDiff[] = [];
  for (const lineKey of keys) {
    if (SKIPPED_RECONCILIATION_KEYS.has(lineKey)) continue;
    const proposedAmount = roundMoney(aggregation.amounts[lineKey] ?? 0);
    const currentAmount = currentPayload
      ? getEditableLineAmount(currentPayload, lineKey)
      : 0;
    if (Math.abs(proposedAmount - currentAmount) < 0.005) continue;
    diffs.push({
      lineKey,
      label: dreEditableLineLabel(lineKey),
      currentAmount,
      proposedAmount,
      delta: roundMoney(proposedAmount - currentAmount),
    });
  }
  diffs.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return diffs;
}
