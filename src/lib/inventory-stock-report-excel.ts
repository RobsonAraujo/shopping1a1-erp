import * as XLSX from "xlsx";
import {
  buildStockReportFilename,
  defaultStockReportReferenceDate,
  formatStockReportCurrency,
  formatStockReportUnits,
  type StockReportBuildResult,
  type StockReportHeader,
} from "./inventory-stock-report";

function cell(value: string | number | null): string | number {
  return value ?? "";
}

export function downloadStockReportExcel(
  header: StockReportHeader,
  result: StockReportBuildResult,
  referenceDate: Date = defaultStockReportReferenceDate(),
): void {
  const sheetData: (string | number)[][] = [
    [header.companyName],
    [header.subtitle],
    [],
    [
      "Nome do produto (SKU)",
      "NCM",
      "Custo unitário (Somando Impostos)",
      "Unidades em estoque",
      "Valor em Estoque",
    ],
  ];

  for (const row of result.rows) {
    sheetData.push([
      row.label,
      cell(row.ncm),
      row.unitCost != null ? row.unitCost : "—",
      formatStockReportUnits(row.units),
      row.stockValue != null ? row.stockValue : "—",
    ]);
  }

  sheetData.push([]);
  sheetData.push([
    "Valor Total em Estoque",
    "",
    "",
    "",
    result.totalValue,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Saldo");
  XLSX.writeFile(
    workbook,
    buildStockReportFilename(referenceDate, "xlsx"),
  );
}

export function formatStockReportPdfCellCurrency(value: number | null): string {
  if (value == null) return "—";
  return formatStockReportCurrency(value);
}
