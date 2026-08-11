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
  | "minhaPaginaMl"
  | "affiliateFeeMl"
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
      methodology?: string;
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
    label: "(+) Total de Entrada",
    methodology: "Igual ao Faturamento ML: soma do valor de venda de todos os pedidos pagos no mês, já incluindo o valor bruto das vendas canceladas (abatido depois em Custos Variáveis).",
  },
  {
    type: "static",
    id: "revenueMl",
    kind: "entrada-detail",
    label: "Faturamento ML",
    source: "ml",
    indent: true,
    lineKey: "revenueMl",
    methodology: "Soma do valor de venda (revenue) de todos os pedidos pagos no mês, pela data de faturamento configurada, mais o valor bruto das vendas canceladas do mês (obtido da fatura ML ou, quando indisponível, do valor absoluto da linha \"Canceladas ML\").",
  },
  {
    type: "static",
    id: "totalCustoOperacional",
    kind: "custo-total",
    label: "(-) Custos Variáveis",
    methodology: "Soma de todas as linhas abaixo (Canceladas, Devoluções parciais, Tarifa ML, Custo produto, Imposto, Frete vendedor, Full envios/armazém/inconformidades, Campanhas ADS, Minha Página, Comissão Afiliados) mais os custos operacionais manuais cadastrados.",
  },
  {
    type: "static",
    id: "cancelledSalesMl",
    kind: "custo-detail",
    label: "Canceladas ML",
    source: "ml",
    indent: true,
    lineKey: "cancelledSalesMl",
    methodology: "Valor bruto das vendas canceladas no mês, conforme a fatura ML (ou estimado pelos pedidos cancelados quando a fatura não está disponível). Lançado como custo para abater o Faturamento ML, que já soma essas vendas de volta.",
  },
  {
    type: "static",
    id: "partialReturnsMl",
    kind: "custo-detail",
    label: "Devoluções parciais",
    source: "ml",
    indent: true,
    lineKey: "partialReturnsMl",
    methodology: "Reembolsos/devoluções parciais da fatura ML no mês (bonificações com esse label). Quando a fatura do ciclo não alinha ao mês civil, o valor ainda vem da fatura (não há estimativa por pedido). Se o mês nunca teve esse tipo de lançamento na fatura, fica zerado — sincronize de novo após atualizações do DRE.",
  },
  {
    type: "static",
    id: "saleFeeMl",
    kind: "custo-detail",
    label: "Tarifa ML",
    source: "ml",
    indent: true,
    lineKey: "saleFeeMl",
    methodology: "Tarifas de venda cobradas pelo Mercado Livre no mês, conforme a fatura ML. Quando a fatura não está disponível/alinhada ao mês civil, é estimada por anúncio (categoria, tipo de anúncio e preço de cada pedido pago).",
  },
  {
    type: "static",
    id: "productCostErp",
    kind: "custo-detail",
    label: "Custo produto",
    source: "erp",
    indent: true,
    lineKey: "productCostErp",
    methodology: "Para cada pedido pago no mês: quantidade vendida × custo unitário do produto (custo de compra, já com ST quando aplicável, + IPI), conforme cadastro de produtos do ERP — sem incluir custos extras. Somado para todos os pedidos do mês (inclui o custo dos itens de kits, quando aplicável).",
  },
  {
    type: "static",
    id: "taxErp",
    kind: "custo-detail",
    label: "Imposto ML",
    source: "erp",
    indent: true,
    lineKey: "taxErp",
    methodology: "Para cada pedido pago no mês: valor de venda × % de imposto (ICMS/ST) apurado no relatório tributário do produto naquele mês. Somado para todos os pedidos do mês.",
  },
  {
    type: "static",
    id: "sellerShippingMl",
    kind: "custo-detail",
    label: "Frete vendedor",
    source: "ml",
    indent: true,
    lineKey: "sellerShippingMl",
    methodology: "Custo de frete pago pelo vendedor no mês, conforme a fatura ML. Quando a fatura não está disponível/alinhada ao mês civil, é estimado por pedido a partir do custo de envio de cada anúncio.",
  },
  {
    type: "static",
    id: "fullShippingMl",
    kind: "custo-detail",
    label: "Full envios",
    source: "ml",
    indent: true,
    lineKey: "fullShippingMl",
    methodology: "Custo de envios do Mercado Envios Full no mês, conforme a fatura ML.",
  },
  {
    type: "static",
    id: "fullStorageMl",
    kind: "custo-detail",
    label: "Full armazém",
    source: "ml",
    indent: true,
    lineKey: "fullStorageMl",
    methodology: "Custo de armazenamento no Full no mês, conforme a fatura ML.",
  },
  {
    type: "static",
    id: "fullNonComplianceMl",
    kind: "custo-detail",
    label: "Full inconform.",
    source: "ml",
    indent: true,
    lineKey: "fullNonComplianceMl",
    methodology: "Multas por inconformidade no Full no mês, conforme a fatura ML.",
  },
  {
    type: "static",
    id: "adsCost",
    kind: "custo-detail",
    label: "Campanhas ADS",
    source: "ads",
    indent: true,
    methodology: "Gasto com campanhas de Product Ads no mês, obtido da API de métricas de anúncios do Mercado Livre (ou da fatura ML como contingência, quando a API de métricas falha).",
  },
  {
    type: "static",
    id: "minhaPaginaMl",
    kind: "custo-detail",
    label: "Minha Página",
    source: "ml",
    indent: true,
    lineKey: "minhaPaginaMl",
    methodology: "Tarifa de manutenção da Minha Página (eShop) cobrada na fatura ML (código CESM).",
  },
  {
    type: "static",
    id: "affiliateFeeMl",
    kind: "custo-detail",
    label: "Comissão Afiliados",
    source: "ml",
    indent: true,
    lineKey: "affiliateFeeMl",
    methodology: "Comissão paga a afiliados (código CVAF/BVAF) na fatura ML do ciclo do mês (key YYYY-MM-01). O ciclo pode começar no mês anterior (ex.: 05/06→04/07 para a fatura de julho) — não é necessariamente o mês civil.",
  },
  {
    type: "static",
    id: "margemContribuicao",
    kind: "resultado",
    label: "(=) Margem de Contribuição",
    showPercent: true,
    methodology: "Total de Entrada + Custos Variáveis (os custos variáveis já entram como valores negativos, então isso equivale a Faturamento − custos variáveis).",
  },
  {
    type: "static",
    id: "totalCustoFixo",
    kind: "custo-total",
    label: "(-) Custo fixo",
    methodology: "Soma dos custos fixos cadastrados manualmente para o mês (aluguel, sistemas, etc. — ver botão \"Custos fixos\").",
  },
  {
    type: "static",
    id: "lucroOperacionalAntesInvestimentos",
    kind: "resultado",
    label: "(=) Lucro Operacional Antes dos Investimentos",
    showPercent: true,
    methodology: "Margem de Contribuição − Custo fixo.",
  },
  {
    type: "static",
    id: "totalInvestimento",
    kind: "custo-total",
    label: "(-) Investimentos",
    methodology: "Soma dos investimentos cadastrados manualmente para o mês (marketing institucional, CAPEX, etc. — ver botão \"Investimentos\").",
  },
  {
    type: "static",
    id: "lucroOperacional",
    kind: "resultado",
    label: "(=) Lucro Operacional",
    showPercent: true,
    methodology: "Lucro Operacional Antes dos Investimentos − Investimentos.",
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

export function getRowMethodology(row: DreTableRow): string | undefined {
  if (row.type === "static") return row.methodology;
  if (row.type === "fixed-cost") {
    return `Valor de custo fixo informado manualmente por você para "${row.label}" neste mês. Itens recorrentes herdam o último valor informado; itens “só no mês” valem apenas onde você digitou.`;
  }
  if (row.type === "operational-cost") {
    return `Valor de custo operacional informado manualmente por você para "${row.label}" neste mês. Itens recorrentes herdam o último valor informado; itens “só no mês” valem apenas onde você digitou.`;
  }
  if (row.type === "investment-cost") {
    return `Valor de investimento informado manualmente por você para "${row.label}" neste mês. Itens recorrentes herdam o último valor informado; itens “só no mês” valem apenas onde você digitou.`;
  }
  return undefined;
}

/** Linhas de grupo/resultado ficam com fundo verde ou vermelho — só essas. */
export function isColoredRow(row: DreTableRow): boolean {
  return (
    row.type === "static" &&
    (row.kind === "entrada-total" ||
      row.kind === "custo-total" ||
      row.kind === "resultado")
  );
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
    return "bg-[#1c573a] text-white";
  }
  if (row.kind === "custo-total") {
    return "bg-[#d43b4f] text-white";
  }
  return "bg-[var(--card)]";
}

export function rowLabelClass(row: DreTableRow): string {
  if (isColoredRow(row)) {
    return "text-[12.5px] font-bold uppercase leading-tight text-white";
  }
  if (
    row.type === "fixed-cost" ||
    row.type === "operational-cost" ||
    row.type === "investment-cost"
  ) {
    return "text-[12.5px] font-bold leading-tight";
  }
  if (row.kind === "entrada-detail" || row.kind === "custo-detail") {
    return "text-[12.5px] font-bold leading-tight text-[var(--foreground)]";
  }
  return "text-[12.5px] font-bold leading-tight";
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
        amount: month.adsCost === null ? null : -Math.max(0, month.adsCost),
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

/** Rótulo amigável de uma linha editável do DRE (para UI de sync/ajustes). */
export function dreEditableLineLabel(
  lineKey: string,
): string {
  const row = DRE_STATIC_ROWS.find(
    (r) => r.id === lineKey || r.lineKey === lineKey,
  );
  return row?.label ?? lineKey;
}
