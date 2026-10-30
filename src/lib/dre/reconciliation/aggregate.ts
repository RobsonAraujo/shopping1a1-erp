import { roundMoney } from "@/lib/pricing/financial-margin";
import type { DreEditableLineKey, DreLineBreakdownItem } from "@/lib/dre/dre-calculations";
import { resolveFeeLineKey } from "@/lib/dre/reconciliation/fee-name-mapping";
import {
  EXCLUDED_FEE_SAMPLE_LIMIT,
  type ExcludedFeeReason,
  type ExcludedFeeSummary,
  type ParsedFeeDetail,
  type ReconciliationLineAggregation,
  type ReconciliationParseWarning,
  type ReconciliationRow,
} from "@/lib/dre/reconciliation/types";

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeType(value: string): string {
  return stripAccents(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function ymd(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
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

function pushExcluded(
  excluded: Map<string, ExcludedFeeSummary>,
  reason: ExcludedFeeReason,
  row: ReconciliationRow,
  fee: ParsedFeeDetail,
  amount: number,
) {
  const name = fee.name || "(sem nome)";
  const mapKey = `${reason}:${name}`;
  const current = excluded.get(mapKey) ?? {
    name,
    reason,
    total: 0,
    occurrences: 0,
    samples: [],
  };
  current.total = roundMoney(current.total + amount);
  current.occurrences += 1;
  if (current.samples.length < EXCLUDED_FEE_SAMPLE_LIMIT) {
    current.samples.push({
      rowIndex: row.rowIndex,
      operationDate: ymd(row.operationDate),
      operationId: row.operationId,
      operationType: row.operationType,
      feeId: fee.feeId,
      amount: roundMoney(amount),
      billingPeriod: row.billingPeriod,
      closingDate: ymd(row.closingDate),
    });
  }
  excluded.set(mapKey, current);
}

export type AggregateReconciliationOptions = {
  /** `mlDifalCountsAsFee(regime)`: DIFAL do ML em Tarifas especiais ou fora. */
  difalCountsAsFee: boolean;
};

/**
 * Soma as tarifas da planilha Por Vendas nas linhas do DRE. O que não é tarifa
 * de venda (juros, DIFAL no Lucro Real) ou não tem nome conhecido fica fora das
 * linhas e vai para `excludedFees`, com o caminho para o usuário achar a
 * cobrança. Tarifas especiais sai sempre (0 quando a planilha não tem): a
 * planilha governa a linha, senão o valor anterior dela continuaria valendo.
 */
export function aggregateReconciliationRows(
  rows: ReconciliationRow[],
  options: AggregateReconciliationOptions,
): ReconciliationLineAggregation {
  const amounts: Partial<Record<DreEditableLineKey, number>> = {
    specialFeesMl: 0,
  };
  const breakdowns: Partial<Record<DreEditableLineKey, DreLineBreakdownItem[]>> =
    {};
  const warnings: ReconciliationParseWarning[] = [];
  const excluded = new Map<string, ExcludedFeeSummary>();

  for (const row of rows) {
    const type = normalizeType(row.operationType);

    if (type.includes("mclicks") || type.includes("anuncios")) {
      continue;
    }

    for (const fee of row.feeDetails) {
      const { kind, lineKey, credit } = resolveFeeLineKey(fee.name);
      if (kind === "skipped") continue;
      const net = fee.netAmount ?? 0;
      const signed = credit ? Math.abs(net) : -Math.abs(net);

      if (kind === "line" && lineKey) {
        addAmount(amounts, lineKey, signed);
        pushBreakdown(breakdowns, lineKey, row, signed);
      } else if (kind === "difal" && options.difalCountsAsFee) {
        addAmount(amounts, "specialFeesMl", signed);
        pushBreakdown(breakdowns, "specialFeesMl", row, signed);
      } else if (kind === "difal") {
        pushExcluded(excluded, "in_sales_tax", row, fee, signed);
      } else if (kind === "non_operational") {
        pushExcluded(excluded, "non_operational", row, fee, signed);
      } else {
        pushExcluded(excluded, "unrecognized", row, fee, signed);
      }
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
    unrecognizedFees: [],
    excludedFees: [...excluded.values()].sort(
      (a, b) => Math.abs(b.total) - Math.abs(a.total),
    ),
    warnings,
  };
}
