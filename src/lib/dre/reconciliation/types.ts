import type { DreEditableLineKey, DreLineBreakdownItem } from "@/lib/dre/dre-calculations";

export type ParsedFeeDetail = {
  feeId: string | null;
  name: string;
  grossAmount: number | null;
  discountAmount: number | null;
  netAmount: number | null;
  postpaid: boolean | null;
};

export type ParsedPaymentDetail = {
  method: string | null;
  installments: number | null;
  status: string | null;
  id: string | null;
  paidAt: string | null;
  releasedAt: string | null;
};

export type ReconciliationRow = {
  rowIndex: number;
  operationDate: Date | null;
  operationId: string;
  operationType: string;
  operationStatus: string | null;
  saleDate: Date | null;
  itemId: string | null;
  itemTitle: string | null;
  sku: string | null;
  category: string | null;
  listingType: string | null;
  quantity: number | null;
  itemValue: number | null;
  mlRebate: number | null;
  sellerDiscount: number | null;
  buyerPaidShipping: number | null;
  buyerInstallmentFee: number | null;
  grossValue: number | null;
  mlBuyerBenefits: number | null;
  totalFees: number | null;
  totalPostpaidFees: number | null;
  netAfterFees: number | null;
  feeDetails: ParsedFeeDetail[];
  feeDetailsRaw: string | null;
  shipmentId: string | null;
  packageId: string | null;
  shippingMethod: string | null;
  shippingGross: number | null;
  shippingDiscount: number | null;
  sellerPaidShipping: number | null;
  billingPeriod: string | null;
  closingDate: Date | null;
  dueDate: Date | null;
  paymentDetails: ParsedPaymentDetail | null;
  paymentDetailsRaw: string | null;
  raw: Record<string, string | number | null>;
};

export type ReconciliationParseWarning = {
  code: string;
  message: string;
};

export class ReconciliationParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReconciliationParseError";
    this.code = code;
  }
}

export type ReconciliationParseResult = {
  sheetName: string;
  rows: ReconciliationRow[];
  warnings: ReconciliationParseWarning[];
};

/**
 * Imports antigos: tarifas sem nome conhecido que foram **somadas** em Tarifas
 * especiais. A agregação atual não soma mais nada às cegas (ver `excludedFees`).
 */
export type UnrecognizedFeeSummary = {
  name: string;
  total: number;
  occurrences: number;
  sampleRowIndexes: number[];
};

/**
 * Por que a cobrança ficou fora das linhas do DRE:
 * - `in_sales_tax`: DIFAL recolhido pelo ML — já está em Impostos sobre vendas;
 * - `non_operational`: despesa financeira (juros de empréstimo);
 * - `unrecognized`: tarifa que o DRE não conhece.
 */
export type ExcludedFeeReason = "in_sales_tax" | "non_operational" | "unrecognized";

/** Uma cobrança fora do DRE, com o que for preciso para achá-la no ML. */
export type ExcludedFeeOccurrence = {
  rowIndex: number;
  /** `YYYY-MM-DD`. */
  operationDate: string | null;
  operationId: string;
  operationType: string;
  feeId: string | null;
  /** Mesmo sinal das linhas: cobrança negativa, estorno positivo. */
  amount: number;
  billingPeriod: string | null;
  /** `YYYY-MM-DD`. */
  closingDate: string | null;
};

export type ExcludedFeeSummary = {
  name: string;
  reason: ExcludedFeeReason;
  total: number;
  occurrences: number;
  /** As primeiras ocorrências (até `EXCLUDED_FEE_SAMPLE_LIMIT`). */
  samples: ExcludedFeeOccurrence[];
};

export const EXCLUDED_FEE_SAMPLE_LIMIT = 20;

export type ReconciliationLineAggregation = {
  amounts: Partial<Record<DreEditableLineKey, number>>;
  breakdowns: Partial<Record<DreEditableLineKey, DreLineBreakdownItem[]>>;
  /** Só imports antigos (somadas em Tarifas especiais); agregação nova grava `[]`. */
  unrecognizedFees: UnrecognizedFeeSummary[];
  /** Cobranças da planilha que ficaram fora das linhas do DRE. */
  excludedFees: ExcludedFeeSummary[];
  warnings: ReconciliationParseWarning[];
};

export type DreReconciliationLineDiff = {
  lineKey: DreEditableLineKey;
  label: string;
  currentAmount: number;
  proposedAmount: number;
  delta: number;
};

export type DreReconciliationLineMatch = {
  lineKey: DreEditableLineKey;
  label: string;
  amount: number;
};

/** Revisão de uma conciliação (prévia nova ou import salvo) contra o DRE atual. */
export type DreReconciliationReview = {
  importId: string;
  month: number;
  fileName: string;
  sheetName: string;
  rowCount: number;
  /** `pending` = prévia nova ou legado aplicado e não salvo; `confirmed` = legado sem marca no snapshot. */
  status: "pending" | "confirmed";
  /** true para import salvo antes do fluxo de um passo (revisão, não prévia). */
  legacy: boolean;
  diff: DreReconciliationLineDiff[];
  matched: DreReconciliationLineMatch[];
  unrecognizedFees: UnrecognizedFeeSummary[];
  excludedFees: ExcludedFeeSummary[];
  warnings: ReconciliationParseWarning[];
};
