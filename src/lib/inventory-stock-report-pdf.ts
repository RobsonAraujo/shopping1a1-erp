import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildStockReportFilename,
  defaultStockReportReferenceDate,
  formatStockReportCurrency,
  formatStockReportUnits,
  type StockReportBuildResult,
  type StockReportHeader,
} from "./inventory-stock-report";

export function downloadStockReportPdf(
  header: StockReportHeader,
  result: StockReportBuildResult,
  referenceDate: Date = defaultStockReportReferenceDate(),
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text(header.companyName, 14, 16);
  doc.setFontSize(11);
  doc.text(header.subtitle, 14, 24);

  const body = result.rows.map((row) => [
    row.label,
    row.ncm ?? "—",
    row.unitCost != null ? formatStockReportCurrency(row.unitCost) : "—",
    formatStockReportUnits(row.units),
    row.stockValue != null ? formatStockReportCurrency(row.stockValue) : "—",
  ]);

  body.push([
    "Valor Total em Estoque",
    "",
    "",
    "",
    formatStockReportCurrency(result.totalValue),
  ]);

  autoTable(doc, {
    startY: 30,
    head: [
      [
        "Nome do produto (SKU)",
        "NCM",
        "Custo unitário\n(Somando Impostos)",
        "Unidades em estoque",
        "Valor em Estoque",
      ],
    ],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 65, 114], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 28 },
      2: { cellWidth: 38 },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 38, halign: "right" },
    },
    didParseCell(data) {
      if (data.section === "body" && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.save(buildStockReportFilename(referenceDate, "pdf"));
}
