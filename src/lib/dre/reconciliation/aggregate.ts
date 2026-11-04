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

function breakdownItemKey(row: ReconciliationRow): string {
  return row.operationId || `${row.rowIndex}`;
}

function pushBreakdown(
  breakdowns: Partial<Record<DreEditableLineKey, DreLineBreakdownItem[]>>,
  key: DreEditableLineKey,
  row: ReconciliationRow,
  amount: number,
) {
  if (amount === 0) return;
  const list = breakdowns[key] ?? [];
  const itemKey = breakdownItemKey(row);
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

/** O frete de um envio na planilha, para abater o que o comprador pagou. */
type ShipmentFreight = {
  /** Cobranças menos estornos. Positivo = saiu do vendedor. */
  charged: number;
  /** A mesma venda pode vir em duas linhas com o mesmo valor: vale o maior, nunca a soma. */
  buyerPaid: number;
  /** Operação da maior cobrança: é nela que o abatimento fica anotado. */
  operationKey: string | null;
  largestCharge: number;
};

function trackShipmentFreight(
  shipments: Map<string, ShipmentFreight>,
  row: ReconciliationRow,
  charge: number,
) {
  if (!row.shipmentId) return;
  const shipment = shipments.get(row.shipmentId) ?? {
    charged: 0,
    buyerPaid: 0,
    operationKey: null,
    largestCharge: 0,
  };
  shipment.charged = roundMoney(shipment.charged + charge);
  shipment.buyerPaid = Math.max(shipment.buyerPaid, row.buyerPaidShipping ?? 0);
  if (charge > shipment.largestCharge) {
    shipment.largestCharge = charge;
    shipment.operationKey = breakdownItemKey(row);
  }
  shipments.set(row.shipmentId, shipment);
}

/**
 * Quando o comprador paga parte do frete, o ML cobra o frete inteiro do vendedor
 * e devolve essa parte junto com a venda. Faturamento não inclui frete, então a
 * cobrança inteira em Frete vendedor seria custo que não saiu do caixa. Abate o
 * que o comprador pagou, sem passar do frete líquido do envio na planilha: envio
 * estornado ou sem cobrança não abate nada.
 */
function abateBuyerPaidShipping(
  amounts: Partial<Record<DreEditableLineKey, number>>,
  breakdowns: Partial<Record<DreEditableLineKey, DreLineBreakdownItem[]>>,
  shipments: Map<string, ShipmentFreight>,
) {
  const itemByKey = new Map(
    (breakdowns.sellerShippingMl ?? []).map((item) => [item.key, item]),
  );
  for (const shipment of shipments.values()) {
    const credit = roundMoney(
      Math.min(shipment.buyerPaid, Math.max(0, shipment.charged)),
    );
    const item = shipment.operationKey
      ? itemByKey.get(shipment.operationKey)
      : undefined;
    if (credit <= 0 || !item) continue;
    addAmount(amounts, "sellerShippingMl", credit);
    item.amount = roundMoney(item.amount + credit);
    item.buyerPaidAmount = roundMoney((item.buyerPaidAmount ?? 0) + credit);
  }
}

/** Total de frete pago pelo comprador já abatido de Frete vendedor. */
export function buyerPaidShippingTotal(
  items: readonly DreLineBreakdownItem[] | null | undefined,
): number {
  return roundMoney(
    (items ?? []).reduce((sum, item) => sum + (item.buyerPaidAmount ?? 0), 0),
  );
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
 * Frete vendedor sai sem o que o comprador pagou (`abateBuyerPaidShipping`).
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
  const shipments = new Map<string, ShipmentFreight>();

  for (const row of rows) {
    const type = normalizeType(row.operationType);

    if (type.includes("mclicks") || type.includes("anuncios")) {
      continue;
    }

    let freightCharge = 0;
    for (const fee of row.feeDetails) {
      const { kind, lineKey, credit } = resolveFeeLineKey(fee.name);
      if (kind === "skipped") continue;
      const net = fee.netAmount ?? 0;
      const signed = credit ? Math.abs(net) : -Math.abs(net);

      if (kind === "line" && lineKey) {
        addAmount(amounts, lineKey, signed);
        pushBreakdown(breakdowns, lineKey, row, signed);
        if (lineKey === "sellerShippingMl") freightCharge -= signed;
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
    trackShipmentFreight(shipments, row, freightCharge);
  }

  abateBuyerPaidShipping(amounts, breakdowns, shipments);

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
