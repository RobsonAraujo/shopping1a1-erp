import { roundMoney } from "@/lib/pricing/financial-margin";
import type { DreEditableLineKey, DreLineBreakdownItem } from "@/lib/dre/dre-calculations";
import { resolveFeeLineKey } from "@/lib/dre/reconciliation/fee-name-mapping";
import type {
  ReconciliationLineAggregation,
  ReconciliationParseWarning,
  ReconciliationRow,
  UnrecognizedFeeSummary,
} from "@/lib/dre/reconciliation/types";

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeType(value: string): string {
  return stripAccents(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function addAmount(
  amounts: Partial<Record<DreEditableLineKey, number>>,
  key: DreEditableLineKey,
  value: number,
) {
  amounts[key] = roundMoney((amounts[key] ?? 0) + value);
}

function pushBreakdown(
  breakdowns: Partial<Record<DreEditableLineKey, DreLineBreakdownItem[]>>,
  key: DreEditableLineKey,
  row: ReconciliationRow,
  amount: number,
) {
  if (amount === 0) return;
  const list = breakdowns[key] ?? [];
  const itemKey = row.operationId || `${row.rowIndex}`;
  const existing = list.find((item) => item.key === itemKey);
  if (existing) {
    existing.amount = roundMoney(existing.amount + amount);
    existing.quantity =
      existing.quantity === null && row.quantity === null
        ? null
        : (existing.quantity ?? 0) + (row.quantity ?? 0);
  } else {
    list.push({
      key: itemKey,
      sku: row.sku,
      title: row.itemTitle || row.operationType || itemKey,
      quantity: row.quantity,
      amount: roundMoney(amount),
    });
  }
  breakdowns[key] = list;
}

export function aggregateReconciliationRows(
  rows: ReconciliationRow[],
): ReconciliationLineAggregation {
  const amounts: Partial<Record<DreEditableLineKey, number>> = {};
  const breakdowns: Partial<Record<DreEditableLineKey, DreLineBreakdownItem[]>> =
    {};
  const warnings: ReconciliationParseWarning[] = [];
  const unrecognizedMap = new Map<string, UnrecognizedFeeSummary>();

  for (const row of rows) {
    const type = normalizeType(row.operationType);

    if (type.includes("mclicks") || type.includes("anuncios")) {
      continue;
    }

    for (const fee of row.feeDetails) {
      const { lineKey, recognized, skipped, credit } = resolveFeeLineKey(
        fee.name,
      );
      const net = fee.netAmount ?? 0;
      if (skipped || !lineKey) continue;
      const unName = fee.name || "(sem nome)";
      if (!recognized) {
        const current = unrecognizedMap.get(unName) ?? {
          name: unName,
          total: 0,
          occurrences: 0,
          sampleRowIndexes: [],
        };
        current.total = roundMoney(current.total + net);
        current.occurrences += 1;
        if (current.sampleRowIndexes.length < 5) {
          current.sampleRowIndexes.push(row.rowIndex);
        }
        unrecognizedMap.set(unName, current);
      }
      const signed = credit ? Math.abs(net) : -Math.abs(net);
      addAmount(amounts, lineKey, signed);
      pushBreakdown(breakdowns, lineKey, row, signed);
    }
  }

  for (const key of Object.keys(breakdowns) as DreEditableLineKey[]) {
    const list = breakdowns[key];
    if (list) {
      breakdowns[key] = list.sort(
        (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
      );
    }
  }

  return {
    amounts,
    breakdowns,
    unrecognizedFees: [...unrecognizedMap.values()],
    warnings,
  };
}
