import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { reportsConfig } from "@/config/reports";
import type { StockCountDetail } from "@/lib/stock/stock-counts";

/**
 * Folha de conferência física para imprimir e levar na prancheta. Agrupada
 * por fornecedor, na mesma ordem da digitação. "Sistema" é o que deveria
 * estar na prateleira: Em casa + o vendido que ainda não foi despachado.
 * A diferença não vai no papel — o ERP calcula na digitação.
 */
export function downloadStockCountPdf(count: StockCountDetail, companyName: string): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const reference = new Date(count.referenceAt).toLocaleString("pt-BR", {
    timeZone: reportsConfig.catalogCompetitionTimezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  doc.setFontSize(14);
  doc.text("Inventário — conferência física", 14, 16);
  doc.setFontSize(9);
  doc.text(`${companyName} · referência ${reference}`, 14, 22);
  doc.text(`Fornecedor: ${count.supplierName ?? "todos"} · ${count.lines.length} produtos`, 14, 27);
  doc.text("Responsável: ______________________________", 120, 27);

  const head = count.blind
    ? [["Nº", "Produto", "SKU", "Contado", "Observação"]]
    : [["Nº", "Produto", "SKU", "Sistema", "A enviar", "Contado", "Observação"]];

  const body: Array<Array<string | { content: string; colSpan: number; styles: Record<string, unknown> }>> = [];
  let lastSupplier: string | null = null;
  for (const line of count.lines) {
    if (line.supplierName !== lastSupplier) {
      lastSupplier = line.supplierName;
      body.push([
        {
          content: line.supplierName,
          colSpan: head[0].length,
          styles: { fontStyle: "bold", fillColor: [238, 241, 246], textColor: 40 },
        },
      ]);
    }
    const expected = line.expectedOwnQty + line.pendingShipmentQty;
    body.push(
      count.blind
        ? [String(line.position), line.title, line.sku ?? "—", "", ""]
        : [
            String(line.position),
            line.title,
            line.sku ?? "—",
            expected.toLocaleString("pt-BR"),
            line.pendingShipmentQty > 0 ? line.pendingShipmentQty.toLocaleString("pt-BR") : "",
            "",
            "",
          ],
    );
  }

  autoTable(doc, {
    startY: 32,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, valign: "middle", lineColor: [200, 205, 212], lineWidth: 0.1 },
    headStyles: { fillColor: [41, 65, 114], textColor: 255 },
    columnStyles: count.blind
      ? {
          0: { cellWidth: 10, halign: "right" },
          1: { cellWidth: 86 },
          2: { cellWidth: 34 },
          3: { cellWidth: 22 },
          4: { cellWidth: 30 },
        }
      : {
          0: { cellWidth: 10, halign: "right" },
          1: { cellWidth: 70 },
          2: { cellWidth: 30 },
          3: { cellWidth: 16, halign: "right" },
          4: { cellWidth: 16, halign: "right" },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 },
        },
    rowPageBreak: "avoid",
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  const y = Math.min(finalY + 14, 280);
  doc.setFontSize(9);
  doc.text("Conferido por: ____________________________   Data: ___/___/______   Assinatura: ____________________", 14, y);
  if (!count.blind) {
    doc.setFontSize(7);
    doc.text(
      "\"Sistema\" já inclui o que foi vendido e ainda não saiu para entrega (\"A enviar\"): esses itens ainda estão na prateleira.",
      14,
      y + 6,
    );
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.text(`Página ${page} de ${pages}`, 196, 290, { align: "right" });
  }

  const ymd = count.referenceAt.slice(0, 10);
  doc.save(`inventario-${ymd}.pdf`);
}
