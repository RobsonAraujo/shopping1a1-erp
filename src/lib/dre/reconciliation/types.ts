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

export type UnrecognizedFeeSummary = {
  name: string;
  total: number;
  occurrences: number;
  sampleRowIndexes: number[];
};

export type ReconciliationLineAggregation = {
  amounts: Partial<Record<DreEditableLineKey, number>>;
  breakdowns: Partial<Record<DreEditableLineKey, DreLineBreakdownItem[]>>;
  unrecognizedFees: UnrecognizedFeeSummary[];
  warnings: ReconciliationParseWarning[];
};

export type DreReconciliationLineDiff = {
  lineKey: DreEditableLineKey;
  label: string;
  currentAmount: number;
  proposedAmount: number;
  delta: number;
};
