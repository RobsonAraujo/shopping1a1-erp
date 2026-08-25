import {
  buildDreTableRows,
  dreMonthShortLabel,
  filterRowsByVisibility,
  getCellValue,
  type DreTableRow,
  type DreVisibilitySettings,
} from "@/lib/dre/dre-table-rows";
import type { DreYearView } from "@/lib/dre/dre-year-data";

function escapeCsvCell(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCsvNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toFixed(2).replace(".", ",");
}

function getYearTotalAmount(
  row: DreTableRow,
  data: DreYearView,
): number | null {
  if (row.type === "fixed-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.fixedCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return hasAny ? -sum : null;
  }
  if (row.type === "operational-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.operationalCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return hasAny ? -sum : null;
  }
  if (row.type === "investment-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.investmentCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return hasAny ? -sum : null;
  }
  if (row.type === "non-operational-out-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.nonOperationalOutValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return hasAny ? -sum : null;
  }
  if (row.type === "non-operational-in-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.nonOperationalInValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }

  const totals = data.yearTotals;
  if (!totals) return null;

  switch (row.id) {
    case "totalEntrada":
      return totals.totalEntrada;
    case "revenueMl":
      return data.months.reduce((s, m) => s + (m.lines?.revenueMl ?? 0), 0);
    case "totalCustoOperacional":
      return totals.totalCustoOperacional;
    case "margemContribuicao":
      return totals.margemContribuicao;
    case "totalCustoFixo":
      return totals.totalCustoFixo;
    case "adsCost":
      return -totals.adsCost;
    case "lucroOperacionalAntesInvestimentos":
      return totals.lucroOperacionalAntesInvestimentos;
    case "totalInvestimento":
      return totals.totalInvestimento;
    case "lucroOperacional":
      return totals.lucroOperacional;
    case "totalSaidaNaoOperacional":
      return totals.totalSaidaNaoOperacional;
    case "totalEntradaNaoOperacional":
      return totals.totalEntradaNaoOperacional;
    case "resultadoLiquido":
      return totals.resultadoLiquido;
    default:
      if (row.lineKey) {
        const hasData = data.months.some((m) => m.lines !== null);
        if (!hasData) return null;
        return data.months.reduce(
          (s, m) => s + (m.lines?.[row.lineKey!] ?? 0),
          0,
        );
      }
      return null;
  }
}

/** Monta CSV (`;`, vírgula decimal, BOM UTF-8) da grade DRE para Excel/Sheets. */
export function buildDreYearCsv(
  data: DreYearView,
  showDetails = true,
  visibility?: DreVisibilitySettings,
): string {
  let rows = buildDreTableRows(
    data.costItems,
    data.operationalCostItems,
    data.investmentCostItems,
    data.nonOperationalOutItems,
    data.nonOperationalInItems,
    showDetails,
  );
  if (visibility) {
    rows = filterRowsByVisibility(rows, visibility);
  }

  const header = [
    "Linha",
    ...data.months.map((m) => dreMonthShortLabel(m.month)),
    "Total",
  ]
    .map(escapeCsvCell)
    .join(";");

  const body = rows.map((row) => {
    const cells = [
      escapeCsvCell(row.label),
      ...data.months.map((month) =>
        formatCsvNumber(getCellValue(row, month).amount),
      ),
      formatCsvNumber(getYearTotalAmount(row, data)),
    ];
    return cells.join(";");
  });

  return `\uFEFF${[header, ...body].join("\n")}`;
}

export function downloadDreYearCsv(
  data: DreYearView,
  showDetails = true,
  visibility?: DreVisibilitySettings,
): void {
  const csv = buildDreYearCsv(data, showDetails, visibility);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dre-${data.year}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
