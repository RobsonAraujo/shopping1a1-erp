import type { OrderChannel } from "@/lib/mercadolibre/order-channel";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import type { TaxRegime } from "@/lib/lucratividade/row-issues";
import {
  computeFinancialMargin,
  formatFinancialMoney,
  formatFinancialPercent,
  listingTypeLabelFromId,
  roundMoney,
} from "@/lib/pricing/financial-margin";

/**
 * Composição das vendas de um anúncio no período: quanto saiu em cada
 * modalidade (varejo/B2B × Full/Flex/Coleta × tipo de anúncio do pedido).
 * Só explica a média — nenhuma margem da Lucratividade muda por causa disto.
 */

/** Forma de envio da venda. Só conhecida no painel (busca sob demanda). */
export type SalesMixLogistic =
  | "full"
  | "flex"
  | "coleta"
  /** Envio fora do Mercado Envios (ex.: retirada, a combinar) ou tipo novo. */
  | "other"
  /** Não deu pra consultar o envio (falha ou acima do teto). */
  | "unclassified";

export type SalesMixEntry = {
  channel: OrderChannel;
  /** Tipo de anúncio do pedido (`gold_special`, `gold_pro`…); `null` se o ML não mandou. */
  listingTypeId: string | null;
  /** Ausente nas linhas do período — o envio só vem na busca do painel. */
  logistic?: SalesMixLogistic;
  /** Linhas de pedido (vendas) nesta modalidade. */
  orders: number;
  units: number;
  revenue: number;
  /** Tarifa ML somada (já × unidades) das linhas que trouxeram `sale_fee`. */
  saleFeeSum: number;
  saleFeeKnownQty: number;
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
};

/** Resposta de `GET /api/financial-evaluation/sales-mix` (painel). */
export type SalesMixForItem = {
  entries: SalesMixEntry[];
  units: number;
  revenue: number;
  shipments: {
    /** Envios distintos dos pedidos (pacotes dividem um envio). */
    total: number;
    /** Com tipo logístico conhecido. */
    classified: number;
    /** `true` = passou do teto; os mais antigos ficaram sem consulta. */
    capped: boolean;
    /** Consultas que falharam (contam como não classificado). */
    failed: number;
  };
};

export type SalesMixSale = {
  channel: OrderChannel;
  listingTypeId: string | null;
  logistic?: SalesMixLogistic;
  quantity: number;
  revenue: number;
  unitPrice: number | null;
  saleFeePerUnit: number | null;
};

export const SALES_CHANNEL_LABEL: Record<OrderChannel, string> = {
  retail: "Varejo",
  b2b: "B2B",
};

export const SALES_LOGISTIC_LABEL: Record<SalesMixLogistic, string> = {
  full: "Full",
  flex: "Flex",
  coleta: "Coleta/Agência",
  other: "Outros envios",
  unclassified: "Envio não classificado",
};

/** `logistic.type` (ou `logistic_type`) de `GET /shipments/{id}` → modalidade. */
export function salesMixLogisticFromShipmentType(
  type: string | null | undefined,
): SalesMixLogistic {
  if (!type) return "unclassified";
  switch (type) {
    case "fulfillment":
      return "full";
    case "self_service":
      return "flex";
    case "xd_drop_off":
    case "drop_off":
    case "cross_docking":
      return "coleta";
    default:
      return "other";
  }
}

function mixKey(sale: Pick<SalesMixSale, "channel" | "listingTypeId" | "logistic">) {
  return `${sale.channel}|${sale.listingTypeId ?? ""}|${sale.logistic ?? ""}`;
}

/** Soma vendas por modalidade; `entries()` devolve da maior pra menor (un.). */
export function createSalesMixAccumulator() {
  const byKey = new Map<string, SalesMixEntry>();
  return {
    add(sale: SalesMixSale) {
      if (sale.quantity <= 0 && sale.revenue <= 0) return;
      const key = mixKey(sale);
      const entry = byKey.get(key) ?? {
        channel: sale.channel,
        listingTypeId: sale.listingTypeId,
        ...(sale.logistic ? { logistic: sale.logistic } : {}),
        orders: 0,
        units: 0,
        revenue: 0,
        saleFeeSum: 0,
        saleFeeKnownQty: 0,
        minUnitPrice: null,
        maxUnitPrice: null,
      };
      entry.orders += 1;
      entry.units += sale.quantity;
      entry.revenue += sale.revenue;
      if (sale.saleFeePerUnit !== null && sale.quantity > 0) {
        entry.saleFeeSum += sale.saleFeePerUnit * sale.quantity;
        entry.saleFeeKnownQty += sale.quantity;
      }
      if (sale.unitPrice !== null && sale.quantity > 0) {
        entry.minUnitPrice =
          entry.minUnitPrice === null
            ? sale.unitPrice
            : Math.min(entry.minUnitPrice, sale.unitPrice);
        entry.maxUnitPrice =
          entry.maxUnitPrice === null
            ? sale.unitPrice
            : Math.max(entry.maxUnitPrice, sale.unitPrice);
      }
      byKey.set(key, entry);
    },
    entries(): SalesMixEntry[] {
      return [...byKey.values()]
        .map((entry) => ({
          ...entry,
          revenue: roundMoney(entry.revenue),
          saleFeeSum: roundMoney(entry.saleFeeSum),
        }))
        .sort((a, b) => b.units - a.units || b.revenue - a.revenue);
    },
  };
}

/** O que a composição lê da linha: custos/frete (iguais aos da margem) e a regra de exclusão. */
export type SalesMixRowInput = Parameters<typeof marginExclusionReason>[0] &
  Pick<
    FinancialEvaluationRow,
    | "shippingCost"
    | "mlFeeAmount"
    | "extraCosts"
    | "listingTypeId"
    | "salePrice"
    | "salesMix"
  >;

type EntryMargin = {
  averagePrice: number;
  feePerUnit: number | null;
  /** `true` = a modalidade não trouxe `sale_fee`; usou a taxa da linha. */
  feeFromRow: boolean;
  marginValue: number | null;
  marginPercent: number | null;
};

/**
 * Margem de uma modalidade com o MESMO frete estimado, custo e imposto da
 * linha — só preço e tarifa mudam. Assim Σ (un. × margem) fecha na margem
 * do anúncio (a menos de centavos de arredondamento).
 */
function entryMargin(row: SalesMixRowInput, entry: SalesMixEntry): EntryMargin {
  const averagePrice =
    entry.units > 0 ? roundMoney(entry.revenue / entry.units) : 0;
  const ownFee =
    entry.saleFeeKnownQty > 0
      ? roundMoney(entry.saleFeeSum / entry.saleFeeKnownQty)
      : null;
  const feePerUnit = ownFee ?? row.mlFeeAmount;
  const feeFromRow = ownFee === null && feePerUnit !== null;
  if (
    marginExclusionReason(row) !== null ||
    feePerUnit === null ||
    row.shippingCost === null ||
    averagePrice <= 0
  ) {
    return {
      averagePrice,
      feePerUnit,
      feeFromRow,
      marginValue: null,
      marginPercent: null,
    };
  }
  const breakdown = computeFinancialMargin({
    salePrice: averagePrice,
    mlFeeAmount: feePerUnit,
    mlFeeRebate: 0,
    shippingCost: row.shippingCost,
    productCost: row.productCost,
    extraCosts: row.extraCosts ?? 0,
    taxRatePercent: row.taxRatePercent,
  });
  return {
    averagePrice,
    feePerUnit,
    feeFromRow,
    marginValue: breakdown.marginValue,
    marginPercent: breakdown.marginPercent,
  };
}

export type SalesMixTableRow = EntryMargin & {
  key: string;
  label: string;
  channel: OrderChannel;
  logistic: SalesMixLogistic | null;
  listingTypeId: string | null;
  orders: number;
  units: number;
  revenue: number;
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
};

export type SalesMixTable = {
  rows: SalesMixTableRow[];
  /** Totais da própria linha do anúncio (a referência da tela). */
  total: {
    units: number;
    revenue: number;
    averagePrice: number;
    feePerUnit: number | null;
    marginValue: number | null;
    marginPercent: number | null;
  };
  /** `false` quando o anúncio está fora da média (sem custo, sem alíquota…). */
  marginAvailable: boolean;
  /** Un. da composição − un. da linha (pedidos que mudaram desde o carregamento). */
  unitsDiff: number;
  /** Rótulos incluem Clássico/Premium (o período tem mais de um tipo, ou um tipo diferente do anúncio). */
  showsListingType: boolean;
  hasFlex: boolean;
  feeFromRow: boolean;
  unclassifiedUnits: number;
};

export function buildSalesMixTable(
  row: SalesMixRowInput,
  entries: SalesMixEntry[],
): SalesMixTable {
  const types = new Set(entries.map((entry) => entry.listingTypeId ?? ""));
  const showsListingType =
    types.size > 1 ||
    entries.some(
      (entry) =>
        entry.listingTypeId !== null &&
        row.listingTypeId !== null &&
        entry.listingTypeId !== row.listingTypeId,
    );

  const rows = entries.map((entry): SalesMixTableRow => {
    const parts = [SALES_CHANNEL_LABEL[entry.channel]];
    if (showsListingType) {
      parts.push(listingTypeLabelFromId(entry.listingTypeId) ?? "Tipo não informado");
    }
    if (entry.logistic) parts.push(SALES_LOGISTIC_LABEL[entry.logistic]);
    return {
      key: mixKey(entry),
      label: parts.join(" · "),
      channel: entry.channel,
      logistic: entry.logistic ?? null,
      listingTypeId: entry.listingTypeId,
      orders: entry.orders,
      units: entry.units,
      revenue: entry.revenue,
      minUnitPrice: entry.minUnitPrice,
      maxUnitPrice: entry.maxUnitPrice,
      ...entryMargin(row, entry),
    };
  });

  const mixUnits = entries.reduce((sum, entry) => sum + entry.units, 0);
  const rowUnits = row.periodUnitsSold ?? 0;
  const marginAvailable = marginExclusionReason(row) === null;

  return {
    rows,
    total: {
      units: rowUnits,
      revenue: row.periodRevenue ?? 0,
      averagePrice: row.salePrice,
      feePerUnit: row.mlFeeAmount,
      marginValue: marginAvailable ? (row.breakdown?.marginValue ?? null) : null,
      marginPercent: marginAvailable ? (row.breakdown?.marginPercent ?? null) : null,
    },
    marginAvailable,
    unitsDiff: mixUnits - rowUnits,
    showsListingType,
    hasFlex: entries.some((entry) => entry.logistic === "flex"),
    feeFromRow: rows.some((tableRow) => tableRow.feeFromRow),
    unclassifiedUnits: entries
      .filter((entry) => entry.logistic === "unclassified")
      .reduce((sum, entry) => sum + entry.units, 0),
  };
}

/** Junta as modalidades de um canal (todos os tipos) numa entrada só. */
function mergeChannel(entries: SalesMixEntry[], channel: OrderChannel): SalesMixEntry | null {
  const own = entries.filter((entry) => entry.channel === channel);
  if (own.length === 0) return null;
  const result: SalesMixEntry = {
    channel,
    listingTypeId: null,
    orders: 0,
    units: 0,
    revenue: 0,
    saleFeeSum: 0,
    saleFeeKnownQty: 0,
    minUnitPrice: null,
    maxUnitPrice: null,
  };
  for (const entry of own) {
    result.orders += entry.orders;
    result.units += entry.units;
    result.revenue += entry.revenue;
    result.saleFeeSum += entry.saleFeeSum;
    result.saleFeeKnownQty += entry.saleFeeKnownQty;
  }
  return result;
}

export type ChannelSplitItem = {
  channel: OrderChannel;
  units: number;
  revenue: number;
  /** % do faturamento do recorte (0–100). */
  revenueShare: number | null;
  /** Margem do canal só sobre os anúncios que entram na média do topo. */
  marginValue: number | null;
  marginPercent: number | null;
};

export type ChannelSplit = {
  items: ChannelSplitItem[];
  totalRevenue: number;
  hasB2b: boolean;
};

const CHANNEL_ORDER: OrderChannel[] = ["retail", "b2b"];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Varejo × B2B no topo. Faturamento: todas as linhas do recorte (como o
 * bloco Faturamento). Margem: só as que entram na média (mesma regra de
 * `computeMarginSummary`), ponderada pelo faturamento.
 */
export function computeChannelSplit(rows: SalesMixRowInput[]): ChannelSplit {
  const acc = new Map<
    OrderChannel,
    { units: number; revenue: number; marginValue: number; saleBase: number; included: boolean }
  >(
    CHANNEL_ORDER.map((channel) => [
      channel,
      { units: 0, revenue: 0, marginValue: 0, saleBase: 0, included: false },
    ]),
  );

  for (const row of rows) {
    if (row.pending || !row.salesMix || row.salesMix.length === 0) continue;
    const included =
      marginExclusionReason(row) === null && (row.periodUnitsSold ?? 0) > 0;
    for (const channel of CHANNEL_ORDER) {
      const merged = mergeChannel(row.salesMix, channel);
      if (!merged) continue;
      const bucket = acc.get(channel)!;
      bucket.units += merged.units;
      bucket.revenue += merged.revenue;
      if (!included) continue;
      const margin = entryMargin(row, merged);
      if (margin.marginValue === null) continue;
      bucket.marginValue += margin.marginValue * merged.units;
      bucket.saleBase += margin.averagePrice * merged.units;
      bucket.included = true;
    }
  }

  const totalRevenue = [...acc.values()].reduce((sum, b) => sum + b.revenue, 0);
  const items = CHANNEL_ORDER.map((channel): ChannelSplitItem => {
    const bucket = acc.get(channel)!;
    return {
      channel,
      units: bucket.units,
      revenue: roundMoney(bucket.revenue),
      revenueShare: totalRevenue > 0 ? round2((bucket.revenue / totalRevenue) * 100) : null,
      marginValue: bucket.included ? roundMoney(bucket.marginValue) : null,
      marginPercent:
        bucket.included && bucket.saleBase > 0
          ? round2((bucket.marginValue / bucket.saleBase) * 100)
          : null,
    };
  });

  const b2b = acc.get("b2b")!;
  return {
    items,
    totalRevenue: roundMoney(totalRevenue),
    hasB2b: b2b.units > 0 || b2b.revenue > 0,
  };
}

// ---------------------------------------------------------------------------
// Explicações: o que é real e o que é estimado na composição.
// Os textos seguem as regras do cálculo (period mode de
// `financial-evaluation-data.ts`) — se uma regra mudar, mude o texto junto.
// ---------------------------------------------------------------------------

/** "o frete padrão do Full do anúncio" — de onde vem o frete usado em todas as linhas. */
function listingShippingSource(listingLogistic: SalesMixLogistic | null): string {
  switch (listingLogistic) {
    case "full":
      return "o frete padrão do Full do anúncio";
    case "flex":
      return "o frete padrão do Flex do anúncio";
    case "coleta":
      return "o frete padrão da Coleta/Agência do anúncio";
    default:
      return "a cotação de frete padrão do anúncio";
  }
}

function perUnit(value: number | null): string {
  return value === null ? "" : ` (${formatFinancialMoney(value)}/un.)`;
}

export type SalesMixRowExplanation = {
  /** Sublinha da linha quando o frete é o padrão de outro envio — diz qual entrou. */
  shippingNote: string | null;
  /** Parágrafos do tooltip da modalidade. */
  lines: string[];
  /** O que vai deixar esta linha exata ("Em breve"). */
  comingSoon: string | null;
};

const LOGISTIC_MEANING: Record<SalesMixLogistic, string> = {
  full: "Full: o Mercado Livre armazena e envia.",
  flex: "Flex: você faz a entrega e recebe um bônus do Mercado Livre por ela.",
  coleta: "Coleta/Agência: o Mercado Livre coleta o pacote ou você o leva a uma agência.",
  other: "Envio fora do Mercado Envios (ex.: retirada ou entrega a combinar).",
  unclassified: "",
};

/**
 * Tooltip e sublinha de uma modalidade. Hoje TODAS as linhas usam o mesmo
 * frete — a cotação do ML para o envio do anúncio (`row.shippingCost`) —, por
 * isso Flex, outros envios e envio diferente do anúncio são "de referência".
 */
export function describeSalesMixRow(
  tableRow: Pick<SalesMixTableRow, "channel" | "logistic" | "feeFromRow">,
  ctx: {
    shippingCost: number | null;
    listingLogistic: SalesMixLogistic | null;
    shipmentsCapped: boolean;
  },
): SalesMixRowExplanation {
  const source = listingShippingSource(ctx.listingLogistic);
  const value = perUnit(ctx.shippingCost);
  const logistic = tableRow.logistic;

  const lines: string[] = [
    tableRow.channel === "b2b"
      ? "B2B: compras de empresas pelo canal B2B do Mercado Livre — podem sair pelo seu preço por quantidade."
      : "Varejo: vendas fora do canal B2B do Mercado Livre.",
  ];
  if (logistic === "unclassified") {
    lines.push(
      ctx.shipmentsCapped
        ? "Não consultamos a forma de envio destes pedidos: o período passou do limite de 1.500 envios por consulta."
        : "O Mercado Livre não informou a forma de envio destes pedidos.",
    );
  } else if (logistic) {
    lines.push(LOGISTIC_MEANING[logistic]);
  }

  if (tableRow.feeFromRow) {
    lines.push("Tarifa: estes pedidos vieram sem tarifa; usamos a tarifa média do anúncio.");
  } else if (logistic === "flex") {
    lines.push("Tarifa: a cobrada pelo Mercado Livre nestes pedidos — no Flex ela pode incluir um custo fixo por unidade.");
  } else {
    lines.push("Tarifa: a cobrada pelo Mercado Livre nestes pedidos.");
  }

  const reference =
    logistic === "flex" ||
    logistic === "other" ||
    logistic === "unclassified" ||
    ((logistic === "full" || logistic === "coleta") && logistic !== ctx.listingLogistic);

  let comingSoon: string | null = null;
  if (logistic === "flex") {
    lines.push(
      `Frete: o Mercado Livre não cobra frete no Flex, e o custo da sua entrega ainda não está cadastrado. Por isso usamos ${source}${value}.`,
    );
    comingSoon = "cadastrar o custo da sua entrega Flex.";
  } else if (logistic === "other") {
    lines.push(`Frete: sem envio do Mercado Livre; usamos ${source}${value}.`);
  } else if (reference) {
    lines.push(`Frete: usamos ${source}${value}, não o frete real destes pedidos.`);
    if (logistic === "full" || logistic === "coleta") {
      comingSoon = "frete real de cada pedido.";
    }
  } else if (logistic) {
    lines.push(
      `Frete: ${source}${value}, cotado pelo Mercado Livre. Pacotes com várias unidades podem custar menos por unidade.`,
    );
  } else {
    lines.push(`Frete: ${source}${value}, igual para todas as vendas.`);
  }

  return {
    shippingNote: reference ? `usa ${source}${value}` : null,
    lines,
    comingSoon,
  };
}

export type MarginPrecisionStatus = "real" | "estimated" | "not_applied" | "outside";

export type MarginPrecisionItem = {
  key: "price" | "fee" | "shipping" | "cost" | "tax" | "returns" | "ads";
  label: string;
  status: MarginPrecisionStatus;
  statusLabel: string;
  detail: string;
  /** O que falta para ficar exato ("Em breve"). */
  comingSoon: string | null;
};

/**
 * "O que é real e o que é estimado" da margem do período — um item por
 * componente, com o que ainda é média/estimativa e o que vai corrigir isso.
 */
export function describeMarginPrecision(
  row: Pick<
    FinancialEvaluationRow,
    "shippingCost" | "productCost" | "extraCosts" | "taxRatePercent" | "isKitComposition"
  >,
  ctx: {
    taxRegime: TaxRegime;
    listingLogistic: SalesMixLogistic | null;
    feeFromRow: boolean;
  },
): MarginPrecisionItem[] {
  const source = listingShippingSource(ctx.listingLogistic);
  const shippingSource = source.charAt(0).toUpperCase() + source.slice(1);
  const cost =
    row.productCost === null ? null : roundMoney(row.productCost + (row.extraCosts ?? 0));
  const simples = ctx.taxRegime === "SIMPLES";

  return [
    {
      key: "price",
      label: "Preço",
      status: "real",
      statusLabel: "Real",
      detail: "Média do que os compradores pagaram em cada modalidade.",
      comingSoon: null,
    },
    {
      key: "fee",
      label: "Tarifa do ML",
      status: "real",
      statusLabel: "Real",
      detail: ctx.feeFromRow
        ? "Cobrada pelo Mercado Livre em cada pedido. Pedidos sem tarifa usam a média do anúncio."
        : "Cobrada pelo Mercado Livre em cada pedido.",
      comingSoon: null,
    },
    {
      key: "shipping",
      label: "Frete",
      status: "estimated",
      statusLabel: "Estimado",
      detail: `${shippingSource}${perUnit(row.shippingCost)}, cotado pelo Mercado Livre e igual para todas as vendas — não é o frete real de cada pedido.`,
      comingSoon: "frete real de cada pedido e custo da sua entrega Flex.",
    },
    {
      key: "cost",
      label: "Custo do produto",
      status: "estimated",
      statusLabel: "Estimado",
      detail:
        cost === null
          ? "Sem custo cadastrado — por isso o anúncio fica fora da média."
          : `${row.isKitComposition ? "Composição do kit no cadastro atual" : "Cadastro atual"} (${formatFinancialMoney(cost)}/un. com custos extras), não o custo da época da venda.`,
      comingSoon: "custo da época da venda.",
    },
    {
      key: "tax",
      label: "Impostos",
      status: "estimated",
      statusLabel: "Estimado",
      detail:
        row.taxRatePercent === null
          ? "Sem alíquota — por isso o anúncio fica fora da média."
          : simples
            ? `Alíquota efetiva do Simples cadastrada para a empresa (${formatFinancialPercent(row.taxRatePercent)}), igual para todas as vendas.`
            : `Alíquota média deste anúncio no Tributário (vendas dos últimos 30 dias): ${formatFinancialPercent(row.taxRatePercent)}. O imposto de cada venda muda com o estado e o tipo do comprador.`,
      comingSoon: simples ? null : "imposto de cada venda.",
    },
    {
      key: "returns",
      label: "Devoluções",
      status: "not_applied",
      statusLabel: "Não descontadas",
      detail: "Pedidos devolvidos depois de pagos ainda contam como venda.",
      comingSoon: "descontar as devoluções.",
    },
    {
      key: "ads",
      label: "ADS",
      status: "outside",
      statusLabel: "Fora da tabela",
      detail:
        "No “Após ADS”, o gasto com Product Ads do período é rateado pelo faturamento (TACOS) — é uma média, não o custo de cada venda.",
      comingSoon: null,
    },
  ];
}
