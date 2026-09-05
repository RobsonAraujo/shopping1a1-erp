"use client";

import { useState } from "react";
import {
  getYearLineBreakdown,
  getYearProductCostBreakdown,
  getYearTaxBreakdown,
  type DreLineBreakdownItem,
} from "@/lib/dre/dre-calculations";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import type { DreStaticRowId, DreTableRow } from "@/lib/dre/dre-table-rows";
import { buildMercadoLivreCostsMetricsUrl } from "@/lib/mercadolibre/costs-metrics-url";

export type AuditKind =
  | "productCost"
  | "tax"
  | "revenue"
  | "cancelledSales"
  | "saleFee"
  | "sellerShipping"
  | "adsCost"
  | "partialReturns"
  | "returnFee"
  | "specialFees"
  | "fullShipping"
  | "fullStorage"
  | "fullNonCompliance"
  | "minhaPagina"
  | "affiliateFee";

export type AuditTarget = { kind: AuditKind; period: number | "year" } | null;

/** Linhas estáticas do DRE que abrem auditoria ao clicar no valor. */
const ROW_ID_TO_AUDIT_KIND: Partial<Record<DreStaticRowId, AuditKind>> = {
  productCostErp: "productCost",
  taxErp: "tax",
  revenueMl: "revenue",
  cancelledSalesMl: "cancelledSales",
  saleFeeMl: "saleFee",
  sellerShippingMl: "sellerShipping",
  adsCost: "adsCost",
  partialReturnsMl: "partialReturns",
  returnFeeMl: "returnFee",
  specialFeesMl: "specialFees",
  fullShippingMl: "fullShipping",
  fullStorageMl: "fullStorage",
  fullNonComplianceMl: "fullNonCompliance",
  minhaPaginaMl: "minhaPagina",
  affiliateFeeMl: "affiliateFee",
};

export function getAuditKindForRow(row: DreTableRow): AuditKind | null {
  return row.type === "static" ? (ROW_ID_TO_AUDIT_KIND[row.id] ?? null) : null;
}

/** Textos do modal de auditoria genérica, por tipo de linha (exceto Custo produto/Imposto ML, que têm modal próprio). */
const LINE_AUDIT_TEXT: Partial<
  Record<AuditKind, { rowLabel: string; amountLabel: string; description: string }>
> = {
  revenue: {
    rowLabel: "Faturamento ML",
    amountLabel: "Faturamento",
    description:
      "Soma do valor de venda de cada pedido pago no mês, por anúncio/SKU (inclui as vendas canceladas somadas de volta ao faturamento).",
  },
  cancelledSales: {
    rowLabel: "Canceladas / devolvidas",
    amountLabel: "Valor cancelado/devolvido",
    description:
      "Soma do valor bruto de cada pedido cancelado ou devolvido no mês, por anúncio/SKU.",
  },
  saleFee: {
    rowLabel: "Tarifa ML",
    amountLabel: "Tarifa",
    description:
      "Tarifas de venda da fatura ML (por label da cobrança) ou, se o mês foi estimado pelos pedidos, por anúncio/SKU.",
  },
  sellerShipping: {
    rowLabel: "Frete vendedor",
    amountLabel: "Frete",
    description:
      "Frete da fatura ML (por label) ou, se estimado pelos pedidos, por anúncio/SKU.",
  },
  adsCost: {
    rowLabel: "Campanhas ADS",
    amountLabel: "Gasto ADS",
    description:
      "Gasto com campanhas de Product Ads no mês, por anúncio.",
  },
  partialReturns: {
    rowLabel: "Devoluções parciais",
    amountLabel: "Valor",
    description:
      "Reembolsos parciais da fatura ML, agrupados pelo label da cobrança.",
  },
  returnFee: {
    rowLabel: "Tarifa de devolução",
    amountLabel: "Tarifa",
    description:
      "Tarifas de devolução da fatura ML (e estornos), por label da cobrança.",
  },
  specialFees: {
    rowLabel: "Tarifas especiais",
    amountLabel: "Tarifa",
    description:
      "Cobranças especiais da fatura ML (DIFAL, CDLIT e correlatas), por label. A planilha Por Vendas não traz esse agrupamento.",
  },
  fullShipping: {
    rowLabel: "Full envios",
    amountLabel: "Custo",
    description: "Tarifas de envio Full da conciliação ML.",
  },
  fullStorage: {
    rowLabel: "Full armazém",
    amountLabel: "Custo",
    description: "Cobrança de armazenamento Full no mês.",
  },
  fullNonCompliance: {
    rowLabel: "Full inconform.",
    amountLabel: "Custo",
    description: "Multas por inconformidade no envio ao Full.",
  },
  minhaPagina: {
    rowLabel: "Minha Página",
    amountLabel: "Tarifa",
    description: "Tarifa de manutenção da Minha Página / E-Shop.",
  },
  affiliateFee: {
    rowLabel: "Comissão Afiliados",
    amountLabel: "Comissão",
    description: "Comissão paga a afiliados.",
  },
};

/** Link para o painel "Tarifas e investimentos" do ML, só para "Tarifas especiais" de um mês específico (não para o total do ano). */
export function buildSpecialFeesExternalLink(
  year: number,
  auditTarget: AuditTarget,
): { href: string; label: string; hint: string } | null {
  if (
    auditTarget === null ||
    auditTarget.kind !== "specialFees" ||
    auditTarget.period === "year"
  ) {
    return null;
  }
  return {
    href: buildMercadoLivreCostsMetricsUrl(year, auditTarget.period),
    label: "Abrir métricas de custos no Mercado Livre",
    hint: "Para conferir o valor exato de \"Outras Tarifas\": no painel do Mercado Livre, vá em Tarifas e investimentos e passe o mouse sobre a linha \"Outras Tarifas\".",
  };
}

const LINE_BREAKDOWN_FIELD: Partial<Record<AuditKind, keyof DreMonthView>> = {
  revenue: "revenueBreakdown",
  cancelledSales: "cancelledSalesBreakdown",
  saleFee: "saleFeeBreakdown",
  sellerShipping: "sellerShippingBreakdown",
  adsCost: "adsCostBreakdown",
  partialReturns: "partialReturnsBreakdown",
  returnFee: "returnFeeBreakdown",
  specialFees: "specialFeesBreakdown",
  fullShipping: "fullShippingBreakdown",
  fullStorage: "fullStorageBreakdown",
  fullNonCompliance: "fullNonComplianceBreakdown",
  minhaPagina: "minhaPaginaBreakdown",
  affiliateFee: "affiliateFeeBreakdown",
};

export type LineAuditState = {
  items: DreLineBreakdownItem[];
  unavailable: boolean;
  needsResync: boolean;
};

/** Resolve itens/estado do modal de auditoria genérica para as linhas que não são Custo produto/Imposto ML. */
function resolveLineAuditState(
  data: DreYearView,
  target: AuditTarget,
): LineAuditState {
  if (target === null || target.kind === "productCost" || target.kind === "tax") {
    return { items: [], unavailable: false, needsResync: false };
  }

  const months =
    target.period === "year"
      ? data.months
      : data.months.filter((m) => m.month === target.period);
  const relevantMonths = months.filter((m) => m.lines !== null);

  const field = LINE_BREAKDOWN_FIELD[target.kind];
  if (!field) return { items: [], unavailable: false, needsResync: false };

  const items = getYearLineBreakdown(
    months.map((m) => (m[field] as DreLineBreakdownItem[] | null) ?? null),
  );

  if (target.kind === "saleFee" || target.kind === "sellerShipping") {
    const billingOnly =
      relevantMonths.length > 0 &&
      relevantMonths.every((m) => m.billingSource === "billing");
    const anyFallbackMissing = relevantMonths.some(
      (m) => m.billingSource === "fallback" && m[field] === null,
    );
    return { items, unavailable: billingOnly, needsResync: anyFallbackMissing };
  }

  const needsResync = relevantMonths.some((m) => m[field] === null);
  return { items, unavailable: false, needsResync };
}

/** true quando algum mês do alvo de auditoria tem lançamentos mas não tem o detalhamento salvo (sincronizado antes desta funcionalidade). */
export function auditTargetNeedsResync(
  data: DreYearView,
  target: AuditTarget,
): boolean {
  if (target === null) return false;
  const months =
    target.period === "year"
      ? data.months
      : data.months.filter((m) => m.month === target.period);
  return months.some((m) =>
    target.kind === "productCost"
      ? m.lines !== null && m.productCostBreakdown === null
      : m.lines !== null && m.taxBreakdown === null,
  );
}

/**
 * Deriva tudo que os modais de auditoria (Custo produto, Imposto ML, e o
 * genérico) precisam a partir de um `AuditTarget` — mesma lógica antes
 * duplicada byte a byte entre `DreYearTableMobile` e `DreYearTableDesktop`.
 * Cada chamador mantém seu próprio estado de `auditTarget` (mobile/desktop
 * são ramos de render mutuamente exclusivos via `useIsMobile()`, então não
 * há mudança de comportamento em não compartilhar o estado em si).
 */
export function useDreAuditTarget(data: DreYearView) {
  const [auditTarget, setAuditTarget] = useState<AuditTarget>(null);

  const productCostAuditItems =
    auditTarget === null || auditTarget.kind !== "productCost"
      ? []
      : auditTarget.period === "year"
        ? getYearProductCostBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.productCostBreakdown ?? []);
  const taxAuditItems =
    auditTarget === null || auditTarget.kind !== "tax"
      ? []
      : auditTarget.period === "year"
        ? getYearTaxBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.taxBreakdown ?? []);
  const auditTitle =
    auditTarget === null
      ? ""
      : auditTarget.period === "year"
        ? `Ano ${data.year}`
        : (data.months.find((m) => m.month === auditTarget.period)?.label ??
          `Mês ${auditTarget.period}`);
  const lineAuditState = resolveLineAuditState(data, auditTarget);
  const lineAuditText =
    auditTarget !== null ? LINE_AUDIT_TEXT[auditTarget.kind] : undefined;
  const specialFeesExternalLink = buildSpecialFeesExternalLink(
    data.year,
    auditTarget,
  );

  return {
    auditTarget,
    setAuditTarget,
    productCostAuditItems,
    taxAuditItems,
    auditTitle,
    lineAuditState,
    lineAuditText,
    specialFeesExternalLink,
  };
}
