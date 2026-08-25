import * as XLSX from "xlsx";
import {
  parseBrMoney,
  parseFeeDetailsCell,
  parsePaymentDetailsCell,
} from "@/lib/dre/reconciliation/fee-details-parser";
import {
  ReconciliationParseError,
  type ReconciliationParseResult,
  type ReconciliationRow,
} from "@/lib/dre/reconciliation/types";

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeHeader(value: unknown): string {
  return stripAccents(String(value ?? ""))
    .toLowerCase()
    .replace(/[=()|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellToString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text || null;
}

function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const text = cellToString(value);
  if (!text) return null;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  }
  const iso = new Date(text);
  return Number.isFinite(iso.getTime()) ? iso : null;
}

function parseIntCell(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const text = cellToString(value);
  if (!text) return null;
  const n = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return parseBrMoney(cellToString(value));
}

const REQUIRED_HEADERS: Record<string, string[]> = {
  operationType: ["tipo de operacao"],
  operationStatus: ["status da operacao"],
  grossValue: ["valor bruto"],
  totalPostpaidFees: [
    "valor total de tarifas pos-pagas",
    "valor total de tarifas pos pagas",
  ],
  feeDetails: ["detalhes de tarifas"],
  sellerPaidShipping: ["envio pago pelo vendedor"],
  sku: ["sku"],
};

const OPTIONAL_HEADERS: Record<string, string[]> = {
  operationDate: ["data da operacao"],
  operationId: ["numero da operacao"],
  saleDate: ["data da venda"],
  itemId: ["id do item"],
  itemTitle: ["item"],
  category: ["categoria"],
  listingType: ["tipo de anuncio"],
  quantity: ["quantidade de itens"],
  itemValue: ["valor do item"],
  mlRebate: ["desconto do mercado livre rebate", "desconto do mercado livre"],
  sellerDiscount: ["desconto do vendedor para comprador"],
  buyerPaidShipping: ["envio pago pelo comprador"],
  buyerInstallmentFee: ["taxa de parcelamento paga pelo comprador"],
  mlBuyerBenefits: ["beneficios do mercado livre ao comprador"],
  totalFees: ["valor total de tarifas desconto ja aplicado"],
  netAfterFees: ["valor liquido apos tarifas"],
  shipmentId: ["numero do envio"],
  packageId: ["numero do pacote"],
  shippingMethod: ["metodo de envio"],
  shippingGross: ["valor bruto do envio"],
  shippingDiscount: ["desconto sobre o envio"],
  billingPeriod: ["periodo de faturamento"],
  closingDate: ["data do fechamento"],
  dueDate: ["data do vencimento"],
  paymentDetails: ["detalhes de pagamento"],
};

function findHeaderIndex(headers: string[], aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => h === alias || h.includes(alias));
    if (idx >= 0) return idx;
  }
  return undefined;
}

function normalizeSheetKey(name: string): string {
  return stripAccents(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function sheetNameLooksLikeReconciliation(name: string): boolean {
  const key = normalizeSheetKey(name);
  return (
    key === "DAILY_CONCILIATION" ||
    key.includes("CONCILIATION") ||
    key.includes("CONCILIACAO") ||
    key.includes("POR_VENDAS")
  );
}

function sheetToMatrix(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
}

function findHeaderRowIndex(
  matrix: (string | number | Date | null)[][],
): number | null {
  const limit = Math.min(matrix.length, 20);
  for (let i = 0; i < limit; i += 1) {
    const headers = (matrix[i] ?? []).map((cell) => normalizeHeader(cell));
    const complete = Object.values(REQUIRED_HEADERS).every(
      (aliases) => findHeaderIndex(headers, aliases) !== undefined,
    );
    if (complete) return i;
  }
  return null;
}

function pickReconciliationSheet(workbook: XLSX.WorkBook): {
  sheetName: string;
  matrix: (string | number | Date | null)[][];
  headerRowIndex: number;
} {
  const matches: {
    sheetName: string;
    matrix: (string | number | Date | null)[][];
    headerRowIndex: number;
    preferred: boolean;
  }[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = sheetToMatrix(sheet);
    const headerRowIndex = findHeaderRowIndex(matrix);
    if (headerRowIndex === null) continue;
    matches.push({
      sheetName,
      matrix,
      headerRowIndex,
      preferred: sheetNameLooksLikeReconciliation(sheetName),
    });
  }
  const selected = matches.find((item) => item.preferred) ?? matches[0];
  if (!selected) {
    throw new ReconciliationParseError(
      "missing_header",
      "Não achei a tabela de conciliação por vendas (colunas como Tipo de operação, Valor bruto e Detalhes de tarifas). Confira se o arquivo é o relatório Por Vendas do Mercado Livre.",
    );
  }
  return selected;
}

export function parseReconciliationWorkbook(
  buffer: ArrayBuffer | Buffer,
): ReconciliationParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  if (workbook.SheetNames.length === 0) {
    throw new ReconciliationParseError(
      "empty_workbook",
      "A planilha não contém abas.",
    );
  }

  const { sheetName, matrix, headerRowIndex } = pickReconciliationSheet(workbook);
  const headerRow = (matrix[headerRowIndex] ?? []).map((cell) => normalizeHeader(cell));
  const requiredIndexes: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
    const idx = findHeaderIndex(headerRow, aliases);
    if (idx === undefined) {
      throw new ReconciliationParseError(
        "missing_column",
        `Coluna obrigatória ausente na planilha: ${aliases[0]}. O Mercado Livre pode ter alterado o layout.`,
      );
    }
    requiredIndexes[key] = idx;
  }
  const optionalIndexes: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(OPTIONAL_HEADERS)) {
    const idx = findHeaderIndex(headerRow, aliases);
    if (idx !== undefined) optionalIndexes[key] = idx;
  }

  const col = (row: (string | number | Date | null)[], key: string) => {
    const idx = requiredIndexes[key] ?? optionalIndexes[key];
    if (idx === undefined) return null;
    return row[idx] ?? null;
  };

  const rows: ReconciliationRow[] = [];
  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const rawRow = matrix[i] ?? [];
    const operationType = cellToString(col(rawRow, "operationType"));
    if (!operationType && money(col(rawRow, "grossValue")) === null) continue;
    const feeDetailsRaw = cellToString(col(rawRow, "feeDetails"));
    const paymentDetailsRaw = cellToString(col(rawRow, "paymentDetails"));
    const raw: Record<string, string | number | null> = {};
    headerRow.forEach((header, idx) => {
      if (!header) return;
      const value = rawRow[idx];
      raw[header] =
        value instanceof Date
          ? value.toISOString()
          : typeof value === "number"
            ? value
            : cellToString(value);
    });
    rows.push({
      rowIndex: i + 1,
      operationDate: parseExcelDate(col(rawRow, "operationDate")),
      operationId: cellToString(col(rawRow, "operationId")) ?? `row-${i + 1}`,
      operationType: operationType ?? "",
      operationStatus: cellToString(col(rawRow, "operationStatus")),
      saleDate: parseExcelDate(col(rawRow, "saleDate")),
      itemId: cellToString(col(rawRow, "itemId")),
      itemTitle: cellToString(col(rawRow, "itemTitle")),
      sku: cellToString(col(rawRow, "sku")),
      category: cellToString(col(rawRow, "category")),
      listingType: cellToString(col(rawRow, "listingType")),
      quantity: parseIntCell(col(rawRow, "quantity")),
      itemValue: money(col(rawRow, "itemValue")),
      mlRebate: money(col(rawRow, "mlRebate")),
      sellerDiscount: money(col(rawRow, "sellerDiscount")),
      buyerPaidShipping: money(col(rawRow, "buyerPaidShipping")),
      buyerInstallmentFee: money(col(rawRow, "buyerInstallmentFee")),
      grossValue: money(col(rawRow, "grossValue")),
      mlBuyerBenefits: money(col(rawRow, "mlBuyerBenefits")),
      totalFees: money(col(rawRow, "totalFees")),
      totalPostpaidFees: money(col(rawRow, "totalPostpaidFees")),
      netAfterFees: money(col(rawRow, "netAfterFees")),
      feeDetails: parseFeeDetailsCell(feeDetailsRaw),
      feeDetailsRaw,
      shipmentId: cellToString(col(rawRow, "shipmentId")),
      packageId: cellToString(col(rawRow, "packageId")),
      shippingMethod: cellToString(col(rawRow, "shippingMethod")),
      shippingGross: money(col(rawRow, "shippingGross")),
      shippingDiscount: money(col(rawRow, "shippingDiscount")),
      sellerPaidShipping: money(col(rawRow, "sellerPaidShipping")),
      billingPeriod: cellToString(col(rawRow, "billingPeriod")),
      closingDate: parseExcelDate(col(rawRow, "closingDate")),
      dueDate: parseExcelDate(col(rawRow, "dueDate")),
      paymentDetails: parsePaymentDetailsCell(paymentDetailsRaw),
      paymentDetailsRaw,
      raw,
    });
  }

  if (rows.length === 0) {
    throw new ReconciliationParseError(
      "no_data_rows",
      "Nenhuma linha de dados encontrada abaixo do cabeçalho.",
    );
  }

  return { sheetName, rows, warnings: [] };
}
