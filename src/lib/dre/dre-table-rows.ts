import type { DreLineAmounts } from "@/lib/dre/dre-calculations";
import type { DreCostItemView, DreMonthView } from "@/lib/dre/dre-year-data";

export type DreRowKind =
  | "entrada-total"
  | "entrada-detail"
  | "custo-total"
  | "custo-detail"
  | "resultado";

export type DreRowSource = "ml" | "erp" | "manual" | "ads";

export type DreStaticRowId =
  | "totalEntrada"
  | "revenueMl"
  | "totalCustoOperacional"
  | "cancelledSalesMl"
  | "saleFeeMl"
  | "partialReturnsMl"
  | "productCostErp"
  | "taxErp"
  | "sellerShippingMl"
  | "fullShippingMl"
  | "fullStorageMl"
  | "fullNonComplianceMl"
  | "adsCost"
  | "margemContribuicao"
  | "totalCustoFixo"
  | "lucroOperacionalAntesInvestimentos"
  | "totalInvestimento"
  | "lucroOperacional";

export type DreTableRow =
  | {
      type: "static";
      id: DreStaticRowId;
      kind: DreRowKind;
      label: string;
      source?: DreRowSource;
      indent?: boolean;
      lineKey?: keyof DreLineAmounts;
      showPercent?: boolean;
    }
  | {
      type: "fixed-cost";
      id: string;
      costItemId: string;
      kind: "custo-detail";
      label: string;
      source: "manual";
      indent: true;
    }
  | {
      type: "operational-cost";
      id: string;
      costItemId: string;
      kind: "custo-detail";
      label: string;
      source: "manual";
      indent: true;
    }
  | {
      type: "investment-cost";
      id: string;
      costItemId: string;
      kind: "custo-detail";
      label: string;
      source: "manual";
      indent: true;
    };

export const DRE_STATIC_ROWS: Extract<DreTableRow, { type: "static" }>[] = [
  {
    type: "static",
    id: "totalEntrada",
    kind: "entrada-total",
    label: "(+) Receita/Faturamento",
  },
  {
    type: "static",
    id: "revenueMl",
    kind: "entrada-detail",
    label: "Faturamento ML",
    source: "ml",
    indent: true,
    lineKey: "revenueMl",
  },
  {
    type: "static",
    id: "totalCustoOperacional",
    kind: "custo-total",
    label: "(-) Custos Variáveis",
  },
  {
    type: "static",
    id: "cancelledSalesMl",
    kind: "custo-detail",
    label: "Canceladas ML",
    source: "ml",
    indent: true,
    lineKey: "cancelledSalesMl",
  },
  {
    type: "static",
    id: "saleFeeMl",
    kind: "custo-detail",
    label: "Tarifa ML",
    source: "ml",
    indent: true,
    lineKey: "saleFeeMl",
  },
  {
    type: "static",
    id: "partialReturnsMl",
    kind: "custo-detail",
    label: "Devolução ML",
    source: "ml",
    indent: true,
    lineKey: "partialReturnsMl",
  },
  {
    type: "static",
    id: "productCostErp",
    kind: "custo-detail",
    label: "Custo produto",
    source: "erp",
    indent: true,
    lineKey: "productCostErp",
  },
  {
    type: "static",
    id: "taxErp",
    kind: "custo-detail",
    label: "Imposto ML",
    source: "erp",
    indent: true,
    lineKey: "taxErp",
  },
  {
    type: "static",
    id: "sellerShippingMl",
    kind: "custo-detail",
    label: "Frete vendedor",
    source: "ml",
    indent: true,
    lineKey: "sellerShippingMl",
  },
  {
    type: "static",
    id: "fullShippingMl",
    kind: "custo-detail",
    label: "Full envios",
    source: "ml",
    indent: true,
    lineKey: "fullShippingMl",
  },
  {
    type: "static",
    id: "fullStorageMl",
    kind: "custo-detail",
    label: "Full armazém",
    source: "ml",
    indent: true,
    lineKey: "fullStorageMl",
  },
  {
    type: "static",
    id: "fullNonComplianceMl",
    kind: "custo-detail",
    label: "Full inconform.",
    source: "ml",
    indent: true,
    lineKey: "fullNonComplianceMl",
  },
  {
    type: "static",
    id: "adsCost",
    kind: "custo-detail",
    label: "Campanhas ADS",
    source: "ads",
    indent: true,
  },
  {
    type: "static",
    id: "margemContribuicao",
    kind: "resultado",
    label: "(=) Margem de Contribuição",
    showPercent: true,
  },
  {
    type: "static",
    id: "totalCustoFixo",
    kind: "custo-total",
    label: "(-) Custo fixo",
  },
  {
    type: "static",
    id: "lucroOperacionalAntesInvestimentos",
    kind: "resultado",
    label: "(=) Lucro Operacional Antes dos Investimentos",
    showPercent: true,
  },
  {
    type: "static",
    id: "totalInvestimento",
    kind: "custo-total",
    label: "(-) Investimentos",
  },
  {
    type: "static",
    id: "lucroOperacional",
    kind: "resultado",
    label: "(=) Lucro Operacional",
    showPercent: true,
  },
];

export function buildDreTableRows(
  costItems: DreCostItemView[],
  operationalCostItems: DreCostItemView[],
  investmentCostItems: DreCostItemView[],
  showDetails: boolean,
): DreTableRow[] {
  const rows: DreTableRow[] = [];
  for (const row of DRE_STATIC_ROWS) {
    if (!showDetails && row.indent) continue;

    if (row.id === "margemContribuicao") {
      if (showDetails) {
        for (const item of operationalCostItems) {
          rows.push({
            type: "operational-cost",
            id: `operational-${item.id}`,
            costItemId: item.id,
            kind: "custo-detail",
            label: item.name,
            source: "manual",
            indent: true,
          });
        }
      }
      rows.push(row);
      continue;
    }

    if (row.id === "totalCustoFixo") {
      rows.push(row);
      if (showDetails) {
        for (const item of costItems) {
          rows.push({
            type: "fixed-cost",
            id: `fixed-${item.id}`,
            costItemId: item.id,
            kind: "custo-detail",
            label: item.name,
            source: "manual",
            indent: true,
          });
        }
      }
      continue;
    }

    if (row.id === "totalInvestimento") {
      rows.push(row);
      if (showDetails) {
        for (const item of investmentCostItems) {
          rows.push({
            type: "investment-cost",
            id: `investment-${item.id}`,
            costItemId: item.id,
            kind: "custo-detail",
            label: item.name,
            source: "manual",
            indent: true,
          });
        }
      }
      continue;
    }

    rows.push(row);
  }
  return rows;
}

export function rowBackgroundClass(row: DreTableRow): string {
  if (
    row.type === "fixed-cost" ||
    row.type === "operational-cost" ||
    row.type === "investment-cost"
  ) {
    return "bg-[var(--card)]";
  }
  if (row.kind === "entrada-detail" || row.kind === "custo-detail") {
    return "bg-[var(--card)]";
  }
  if (row.kind === "entrada-total" || row.kind === "resultado") {
    return "bg-emerald-200/95 text-emerald-950 dark:bg-emerald-900/55 dark:text-emerald-50";
  }
  if (row.kind === "custo-total") {
    return "bg-rose-200/95 text-rose-950 dark:bg-rose-900/55 dark:text-rose-50";
  }
  return "bg-[var(--card)]";
}

export function rowLabelClass(row: DreTableRow): string {
  if (
    row.type === "fixed-cost" ||
    row.type === "operational-cost" ||
    row.type === "investment-cost"
  ) {
    return "text-xs leading-tight";
  }
  if (row.kind === "entrada-detail" || row.kind === "custo-detail") {
    return "text-xs leading-tight text-[var(--foreground)]";
  }
  if (row.kind === "resultado") return "text-xs font-bold leading-tight";
  if (row.kind === "entrada-total" || row.kind === "custo-total") {
    return "text-xs font-semibold leading-tight";
  }
  return "text-xs leading-tight";
}

export function valueToneClass(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "text-[var(--muted-foreground)]";
  }
  if (value > 0) return "text-emerald-800 dark:text-emerald-300";
  if (value < 0) return "text-rose-800 dark:text-rose-300";
  return "text-[var(--muted-foreground)]";
}

export function getCellValue(
  row: DreTableRow,
  month: DreMonthView,
): { amount: number | null; percent: number | null } {
  if (row.type === "fixed-cost") {
    const raw = month.fixedCostValues[row.costItemId];
    return {
      amount: raw === null || raw === undefined ? null : -raw,
      percent: null,
    };
  }

  if (row.type === "operational-cost") {
    const raw = month.operationalCostValues[row.costItemId];
    return {
      amount: raw === null || raw === undefined ? null : -raw,
      percent: null,
    };
  }

  if (row.type === "investment-cost") {
    const raw = month.investmentCostValues[row.costItemId];
    return {
      amount: raw === null || raw === undefined ? null : -raw,
      percent: null,
    };
  }

  const totals = month.totals;

  switch (row.id) {
    case "totalEntrada":
      return { amount: totals?.totalEntrada ?? null, percent: null };
    case "revenueMl":
      return { amount: month.lines?.revenueMl ?? null, percent: null };
    case "totalCustoOperacional":
      return { amount: totals?.totalCustoOperacional ?? null, percent: null };
    case "margemContribuicao":
      return {
        amount: totals?.margemContribuicao ?? null,
        percent: totals?.margemContribuicaoPercent ?? null,
      };
    case "totalCustoFixo":
      return { amount: totals?.totalCustoFixo ?? null, percent: null };
    case "adsCost":
      return {
        amount:
          month.adsCost === null ? null : -Math.max(0, month.adsCost),
        percent: null,
      };
    case "lucroOperacionalAntesInvestimentos":
      return {
        amount: totals?.lucroOperacionalAntesInvestimentos ?? null,
        percent: totals?.lucroOperacionalAntesInvestimentosPercent ?? null,
      };
    case "totalInvestimento":
      return { amount: totals?.totalInvestimento ?? null, percent: null };
    case "lucroOperacional":
      return {
        amount: totals?.lucroOperacional ?? null,
        percent: totals?.lucroOperacionalPercent ?? null,
      };
    default:
      if (row.type === "static" && row.lineKey && month.lines) {
        return { amount: month.lines[row.lineKey], percent: null };
      }
      return { amount: null, percent: null };
  }
}

export function isDetailRow(row: DreTableRow): boolean {
  if (
    row.type === "fixed-cost" ||
    row.type === "operational-cost" ||
    row.type === "investment-cost"
  ) {
    return true;
  }
  return Boolean(row.indent);
}

export const DRE_MONTH_HEADER_COLORS = [
  "bg-sky-100/90 dark:bg-sky-950/50",
  "bg-indigo-100/90 dark:bg-indigo-950/50",
  "bg-violet-100/90 dark:bg-violet-950/50",
  "bg-fuchsia-100/90 dark:bg-fuchsia-950/50",
  "bg-pink-100/90 dark:bg-pink-950/50",
  "bg-rose-100/90 dark:bg-rose-950/50",
  "bg-orange-100/90 dark:bg-orange-950/50",
  "bg-amber-100/90 dark:bg-amber-950/50",
  "bg-lime-100/90 dark:bg-lime-950/50",
  "bg-emerald-100/90 dark:bg-emerald-950/50",
  "bg-teal-100/90 dark:bg-teal-950/50",
  "bg-cyan-100/90 dark:bg-cyan-950/50",
] as const;

export function dreMonthHeaderColorClass(month: number): string {
  if (month < 1 || month > 12) return "bg-[var(--muted)]/40";
  return DRE_MONTH_HEADER_COLORS[month - 1];
}

export const DRE_MONTH_SHORT = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
] as const;

export function dreMonthShortLabel(month: number): string {
  if (month < 1 || month > 12) return String(month);
  return DRE_MONTH_SHORT[month - 1];
}
