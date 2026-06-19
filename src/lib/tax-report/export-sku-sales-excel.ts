import * as XLSX from "xlsx";
import { percentOfSale } from "@/lib/financial-margin";
import { impostoOperacionalLinha } from "@/lib/tax-report/imposto-operacional";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

export type SkuSalesExcelRow = {
  Data: string;
  Pedido: string;
  UF: string;
  "Doc.": string;
  Qtd: number;
  Receita: number;
  "PIS/COFINS": number | null;
  ICMS: number | null;
  DIFAL: number | null;
  "IRPJ+CSLL": number | null;
  "Imp. oper. (R$)": number | null;
  "Imp. oper. (%)": number | null;
  "Imposto (R$)": number | null;
  "Imposto (%)": number | null;
  Margem: number | null;
  "Incluído na apuração": string;
  "Memória de cálculo": string;
};

export type SkuSalesExcelMeta = {
  sku: string;
  year: number;
  month: number;
  filterUf?: string;
};

function mapDetalhamentoToExcelRow(row: DetalhamentoTributario): SkuSalesExcelRow {
  const t = row.transacao;
  const impostoOperacional = impostoOperacionalLinha(row);
  const impostoOperacionalPercent =
    impostoOperacional != null
      ? percentOfSale(impostoOperacional, t.receitaBruta)
      : null;
  const impostoPercent = row.incluidoNaApuracao
    ? percentOfSale(row.impostoTotal, t.receitaBruta)
    : null;

  return {
    Data: t.orderDate.slice(0, 10),
    Pedido: t.orderId,
    UF: t.ufDestino ?? "",
    "Doc.": t.tipoDocumento,
    Qtd: t.quantidade,
    Receita: t.receitaBruta,
    "PIS/COFINS": row.incluidoNaApuracao
      ? (row.pisCofins?.liquido ?? null)
      : null,
    ICMS: row.incluidoNaApuracao
      ? (row.icmsDifal?.icmsTotal ?? null)
      : null,
    DIFAL: row.incluidoNaApuracao
      ? (row.icmsDifal?.difal ?? null)
      : null,
    "IRPJ+CSLL": row.incluidoNaApuracao
      ? (row.irpjCsll?.irpjTotal ?? 0) + (row.irpjCsll?.csll ?? 0)
      : null,
    "Imp. oper. (R$)": impostoOperacional,
    "Imp. oper. (%)": impostoOperacionalPercent,
    "Imposto (R$)": row.incluidoNaApuracao ? row.impostoTotal : null,
    "Imposto (%)": impostoPercent,
    Margem: row.incluidoNaApuracao ? row.margemLiquidaEstimada : null,
    "Incluído na apuração": row.incluidoNaApuracao ? "Sim" : "Não",
    "Memória de cálculo": row.memoriaCalculo.join("\n"),
  };
}

export function buildSkuSalesExcelRows(
  rows: DetalhamentoTributario[],
): SkuSalesExcelRow[] {
  return rows.map(mapDetalhamentoToExcelRow);
}

export function buildSkuSalesExcelFilename(meta: SkuSalesExcelMeta): string {
  const safeSku = meta.sku.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const month = String(meta.month).padStart(2, "0");
  return `relatorio-tributario-${safeSku}-${meta.year}-${month}.xlsx`;
}

export function downloadSkuSalesExcel(
  rows: DetalhamentoTributario[],
  meta: SkuSalesExcelMeta,
): void {
  const sheetRows = buildSkuSalesExcelRows(rows);
  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Vendas");
  XLSX.writeFile(workbook, buildSkuSalesExcelFilename(meta));
}
