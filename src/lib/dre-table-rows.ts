import type { DreLineAmounts } from "@/lib/dre-calculations";
import type { DreCostItemView, DreMonthView } from "@/lib/dre-year-data";

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
  | "margemContribuicao"
  | "totalCustoFixo"
  | "adsCost"
  | "lucroLiquido";

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
    };

export const DRE_STATIC_ROWS: Extract<DreTableRow, { type: "static" }>[] = [
  {
    type: "static",
    id: "totalEntrada",
    kind: "entrada-total",
    label: "(+) TOTAL ENTRADA",
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
    label: "(-) TOTAL CUSTO OPERACIONAL",
  },
  {
    type: "static",
    id: "cancelledSalesMl",
    kind: "custo-detail",
    label: "Vendas canceladas ML",
    source: "ml",
    indent: true,
    lineKey: "cancelledSalesMl",
  },
  {
    type: "static",
    id: "saleFeeMl",
    kind: "custo-detail",
    label: "Tarifa de venda ML",
    source: "ml",
    indent: true,
    lineKey: "saleFeeMl",
  },
  {
    type: "static",
    id: "partialReturnsMl",
    kind: "custo-detail",
    label: "Devolução parcial ML",
    source: "ml",
    indent: true,
    lineKey: "partialReturnsMl",
  },
  {
    type: "static",
    id: "productCostErp",
    kind: "custo-detail",
    label: "Custo dos produtos ML",
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
    label: "Frete vendedor ML",
    source: "ml",
    indent: true,
    lineKey: "sellerShippingMl",
  },
  {
    type: "static",
    id: "margemContribuicao",
    kind: "resultado",
    label: "(=) MARGEM DE CONTRIBUIÇÃO",
    showPercent: true,
  },
  {
    type: "static",
    id: "totalCustoFixo",
    kind: "custo-total",
    label: "(-) TOTAL CUSTO FIXO",
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
    id: "lucroLiquido",
    kind: "resultado",
    label: "(=) LUCRO LÍQUIDO",
    showPercent: true,
  },
];

export function buildDreTableRows(
  costItems: DreCostItemView[],
  showDetails: boolean,
): DreTableRow[] {
  const rows: DreTableRow[] = [];
  for (const row of DRE_STATIC_ROWS) {
    if (!showDetails && row.indent) continue;

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

    rows.push(row);
  }
  return rows;
}

export function rowBackgroundClass(row: DreTableRow): string {
  if (row.type === "fixed-cost") {
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
  if (row.type === "fixed-cost") return "text-sm";
  if (row.kind === "entrada-detail" || row.kind === "custo-detail") {
    return "text-sm text-[var(--foreground)]";
  }
  if (row.kind === "resultado") return "text-sm font-bold";
  if (row.kind === "entrada-total" || row.kind === "custo-total") {
    return "text-sm font-semibold";
  }
  return "text-sm";
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
    case "lucroLiquido":
      return {
        amount: totals?.lucroLiquido ?? null,
        percent: totals?.lucroLiquidoPercent ?? null,
      };
    default:
      if (row.lineKey && month.lines) {
        return { amount: month.lines[row.lineKey], percent: null };
      }
      return { amount: null, percent: null };
  }
}

export function isDetailRow(row: DreTableRow): boolean {
  if (row.type === "fixed-cost") return true;
  return Boolean(row.indent);
}
