import { roundMoney } from "@/lib/pricing/financial-margin";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";

export type DreLineAmounts = {
  revenueMl: number;
  cancelledSalesMl: number;
  saleFeeMl: number;
  partialReturnsMl: number;
  returnFeeMl: number;
  specialFeesMl: number;
  productCostErp: number;
  taxErp: number;
  sellerShippingMl: number;
  fullShippingMl: number;
  fullStorageMl: number;
  fullNonComplianceMl: number;
  minhaPaginaMl: number;
  affiliateFeeMl: number;
};

export type DreBillingSource = "billing" | "fallback";

/** Valores de pedidos cancelados para visão compatível com o painel ML. */
export type DreCancelledIncludeOverlay = {
  revenueGross: number;
  productCostErp: number;
  taxErp: number;
};

/** Auditoria do Custo produto: quantidade vendida e custo por SKU/anúncio no mês. */
export type DreProductCostBreakdownItem = {
  key: string;
  sku: string | null;
  title: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  missingCost: boolean;
  /** true quando o custo unitário veio de um nivelamento DRE no período. */
  leveled?: boolean;
  /** Unidades do mesmo SKU/período que vieram de pedidos cancelados — não contam em `quantity`/`totalCost`, só informativas (mesma linha do produto, não uma linha separada). */
  cancelledQuantity?: number;
  /** Custo correspondente a `cancelledQuantity` — não conta em `totalCost`. */
  cancelledCost?: number;
};

/** Separa na auditoria vendas niveladas vs custo do cadastro (mesmo SKU no mês). */
export function productCostAuditKey(
  baseKey: string,
  leveled: boolean,
): string {
  const bare = baseKey.replace(/::(leveled|cadastro)$/, "");
  return `${bare}${leveled ? "::leveled" : "::cadastro"}`;
}

/**
 * Chave de identidade pra agrupar breakdown por produto (custo/imposto/receita
 * no drilldown anual do DRE): `mlItemId` do anúncio de origem — cada anúncio
 * é seu próprio produto (1 MLB = 1 Product, sem merge automático), então é a
 * única chave que nunca funde duas linhas por coincidência de texto de SKU
 * (Product.sku não é mais único). Cai pro texto de sku só quando não há
 * itemId (defensivo — as linhas de pedido sempre têm itemId na prática).
 */
export function breakdownIdentityKey(
  itemId: string | null | undefined,
  sku: string | null,
): string {
  if (itemId) return `item:${itemId}`;
  return sku ? normalizeProductSku(sku) || sku : "(sem SKU)";
}

export function normalizeProductCostAuditMergeKey(
  item: Pick<DreProductCostBreakdownItem, "key" | "leveled">,
): string {
  if (/::(leveled|cadastro)$/.test(item.key)) return item.key;
  return productCostAuditKey(item.key, Boolean(item.leveled));
}

/** Auditoria do Imposto ML: faturamento, % de imposto aplicado e imposto total por SKU/anúncio no mês. */
export type DreTaxBreakdownItem = {
  key: string;
  sku: string | null;
  title: string;
  quantity: number;
  revenue: number;
  taxPercent: number | null;
  totalTax: number;
  missingTax: boolean;
  /** Unidades do mesmo SKU/período que vieram de pedidos cancelados — não contam em `quantity`/`revenue`/`totalTax`, só informativas (mesma linha do produto). */
  cancelledQuantity?: number;
  cancelledRevenue?: number;
  cancelledTax?: number;
};

/** Auditoria genérica (quantidade + valor) por SKU/anúncio, usada por linhas mais simples (faturamento, canceladas, tarifas, frete, ADS). */
export type DreLineBreakdownItem = {
  key: string;
  sku: string | null;
  title: string;
  quantity: number | null;
  amount: number;
  /**
   * Parte de `quantity`/`amount` (na mesma linha) que veio de pedidos
   * cancelados — hoje só usado em Faturamento ML, onde a receita cancelada
   * já está somada em `amount`/`quantity` (o painel ML inclui canceladas no
   * faturamento bruto); estes campos são só para anotar quanto disso é
   * cancelado, sem alterar a soma.
   */
  cancelledQuantity?: number | null;
  cancelledAmount?: number;
};

/** Linhas do snapshot que podem ser editadas manualmente na grade do DRE. */
export const DRE_EDITABLE_LINE_KEYS = [
  "revenueMl",
  "cancelledSalesMl",
  "saleFeeMl",
  "partialReturnsMl",
  "returnFeeMl",
  "specialFeesMl",
  "productCostErp",
  "taxErp",
  "sellerShippingMl",
  "fullShippingMl",
  "fullStorageMl",
  "fullNonComplianceMl",
  "minhaPaginaMl",
  "affiliateFeeMl",
  "adsCost",
] as const;

export type DreEditableLineKey = (typeof DRE_EDITABLE_LINE_KEYS)[number];

export function isDreEditableLineKey(key: string): key is DreEditableLineKey {
  return (DRE_EDITABLE_LINE_KEYS as readonly string[]).includes(key);
}

export type DreMonthSnapshotPayload = DreLineAmounts & {
  adsCost: number;
  billingSource: DreBillingSource;
  isPartial: boolean;
  incompleteProductCostCount: number;
  syncWarnings: string[];
  cancelledIncludeOverlay?: DreCancelledIncludeOverlay;
  productCostBreakdown?: DreProductCostBreakdownItem[];
  taxBreakdown?: DreTaxBreakdownItem[];
  revenueBreakdown?: DreLineBreakdownItem[];
  cancelledSalesBreakdown?: DreLineBreakdownItem[];
  saleFeeBreakdown?: DreLineBreakdownItem[];
  sellerShippingBreakdown?: DreLineBreakdownItem[];
  adsCostBreakdown?: DreLineBreakdownItem[];
  partialReturnsBreakdown?: DreLineBreakdownItem[];
  returnFeeBreakdown?: DreLineBreakdownItem[];
  specialFeesBreakdown?: DreLineBreakdownItem[];
  fullShippingBreakdown?: DreLineBreakdownItem[];
  fullStorageBreakdown?: DreLineBreakdownItem[];
  fullNonComplianceBreakdown?: DreLineBreakdownItem[];
  minhaPaginaBreakdown?: DreLineBreakdownItem[];
  affiliateFeeBreakdown?: DreLineBreakdownItem[];
  /** true quando Full envios/inconformidade vieram dos envios já importados no Relatório Full deste mês (mais confiável que o total consolidado da fatura). */
  fullReportSourced?: boolean;
  /**
   * Valores das linhas no último sync (baseline para “restaurar do sync”).
   * Preenchido/atualizado em toda sincronização; preservado em edições manuais.
   */
  syncedLineBaseline?: Partial<Record<DreEditableLineKey, number>>;
  /**
   * Listas de auditoria no último sync. Restaurar o valor também restaura
   * esta lista (senão a conciliação deixava o breakdown antigo).
   */
  syncedBreakdownBaseline?: DreSyncedBreakdownBaseline;
  /** Chaves com valor diferente do baseline (editadas após o último sync). */
  manuallyEditedLineKeys?: DreEditableLineKey[];
  /**
   * true só quando `syncedLineBaseline` veio de um sync real (ML). Distingue
   * isso do baseline "fantasma" que `applyManualLineEdit` semeia ao editar
   * uma linha num snapshot vazio (mês sem sync ainda) — sem essa distinção,
   * o botão "Restaurar" aparece e reverte pro valor pré-edição (ex.: 0) em
   * vez de para um valor de sync de verdade.
   */
  hasRealSyncBaseline?: boolean;
};

export const DRE_LINE_KEY_TO_BREAKDOWN_FIELD: Partial<
  Record<DreEditableLineKey, DreBreakdownField>
> = {
  revenueMl: "revenueBreakdown",
  cancelledSalesMl: "cancelledSalesBreakdown",
  saleFeeMl: "saleFeeBreakdown",
  sellerShippingMl: "sellerShippingBreakdown",
  adsCost: "adsCostBreakdown",
  partialReturnsMl: "partialReturnsBreakdown",
  returnFeeMl: "returnFeeBreakdown",
  specialFeesMl: "specialFeesBreakdown",
  fullShippingMl: "fullShippingBreakdown",
  fullStorageMl: "fullStorageBreakdown",
  fullNonComplianceMl: "fullNonComplianceBreakdown",
  minhaPaginaMl: "minhaPaginaBreakdown",
  affiliateFeeMl: "affiliateFeeBreakdown",
  productCostErp: "productCostBreakdown",
  taxErp: "taxBreakdown",
};

export type DreBreakdownField =
  | "revenueBreakdown"
  | "cancelledSalesBreakdown"
  | "saleFeeBreakdown"
  | "sellerShippingBreakdown"
  | "adsCostBreakdown"
  | "partialReturnsBreakdown"
  | "returnFeeBreakdown"
  | "specialFeesBreakdown"
  | "fullShippingBreakdown"
  | "fullStorageBreakdown"
  | "fullNonComplianceBreakdown"
  | "minhaPaginaBreakdown"
  | "affiliateFeeBreakdown"
  | "productCostBreakdown"
  | "taxBreakdown";

export type DreSyncedBreakdownBaseline = Partial<
  Pick<DreMonthSnapshotPayload, DreBreakdownField>
>;

const ALL_BREAKDOWN_FIELDS: DreBreakdownField[] = [
  "revenueBreakdown",
  "cancelledSalesBreakdown",
  "saleFeeBreakdown",
  "sellerShippingBreakdown",
  "adsCostBreakdown",
  "partialReturnsBreakdown",
  "returnFeeBreakdown",
  "specialFeesBreakdown",
  "fullShippingBreakdown",
  "fullStorageBreakdown",
  "fullNonComplianceBreakdown",
  "minhaPaginaBreakdown",
  "affiliateFeeBreakdown",
  "productCostBreakdown",
  "taxBreakdown",
];

export function captureSyncedBreakdowns(
  payload: DreMonthSnapshotPayload,
): DreSyncedBreakdownBaseline {
  const captured: DreSyncedBreakdownBaseline = {};
  for (const field of ALL_BREAKDOWN_FIELDS) {
    const value = payload[field];
    if (value !== undefined) {
      (captured as Record<string, unknown>)[field] = value;
    }
  }
  return captured;
}

function restoreBreakdownField(
  payload: DreMonthSnapshotPayload,
  lineKey: DreEditableLineKey,
): Pick<DreMonthSnapshotPayload, DreBreakdownField> {
  const field = DRE_LINE_KEY_TO_BREAKDOWN_FIELD[lineKey];
  if (!field) return {};
  const baseline = payload.syncedBreakdownBaseline;
  if (!baseline || !Object.prototype.hasOwnProperty.call(baseline, field)) {
    return { [field]: undefined } as Pick<
      DreMonthSnapshotPayload,
      DreBreakdownField
    >;
  }
  return { [field]: baseline[field] } as Pick<
    DreMonthSnapshotPayload,
    DreBreakdownField
  >;
}

/** Lê o valor armazenado de uma linha editável no payload. */
export function getEditableLineAmount(
  payload: Pick<DreMonthSnapshotPayload, DreEditableLineKey>,
  lineKey: DreEditableLineKey,
): number {
  return payload[lineKey] ?? 0;
}

/** Snapshot dos valores atuais de todas as linhas editáveis (usado no sync). */
export function buildSyncedLineBaseline(
  payload: Pick<DreMonthSnapshotPayload, DreEditableLineKey>,
): Record<DreEditableLineKey, number> {
  const baseline = {} as Record<DreEditableLineKey, number>;
  for (const key of DRE_EDITABLE_LINE_KEYS) {
    baseline[key] = getEditableLineAmount(payload, key);
  }
  return baseline;
}

/**
 * Anexa baseline do sync e limpa marcas de edição manual.
 * Chamar ao persistir um snapshot vindo de `buildDreMonthSnapshot`.
 */
export function withSyncLineBaseline(
  payload: DreMonthSnapshotPayload,
): DreMonthSnapshotPayload {
  return {
    ...payload,
    syncedLineBaseline: buildSyncedLineBaseline(payload),
    syncedBreakdownBaseline: captureSyncedBreakdowns(payload),
    manuallyEditedLineKeys: [],
    hasRealSyncBaseline: true,
  };
}

/**
 * Após um sync fresco, reaplica valores manuais escolhidos pelo usuário.
 * O baseline passa a ser o valor recém-sincronizado (para “restaurar” depois).
 */
export function mergePreservedManualLines(
  fresh: DreMonthSnapshotPayload,
  previous: DreMonthSnapshotPayload | null | undefined,
  preserveKeys: readonly DreEditableLineKey[],
): DreMonthSnapshotPayload {
  const baseline = buildSyncedLineBaseline(fresh);
  const freshBreakdowns = captureSyncedBreakdowns(fresh);
  if (!previous || preserveKeys.length === 0) {
    return {
      ...fresh,
      syncedLineBaseline: baseline,
      syncedBreakdownBaseline: freshBreakdowns,
      manuallyEditedLineKeys: [],
      hasRealSyncBaseline: true,
    };
  }

  const prevEdited = new Set(previous.manuallyEditedLineKeys ?? []);
  const next: DreMonthSnapshotPayload = {
    ...fresh,
    syncedLineBaseline: baseline,
    syncedBreakdownBaseline: freshBreakdowns,
    hasRealSyncBaseline: true,
  };
  const edited: DreEditableLineKey[] = [];

  for (const key of preserveKeys) {
    if (!prevEdited.has(key)) continue;
    const amount = getEditableLineAmount(previous, key);
    next[key] = amount;
    const breakdownField = DRE_LINE_KEY_TO_BREAKDOWN_FIELD[key];
    if (breakdownField) {
      (next as Record<string, unknown>)[breakdownField] =
        previous[breakdownField];
    }
    if (!amountsMatch(amount, baseline[key])) {
      edited.push(key);
    }
  }

  next.manuallyEditedLineKeys = edited;

  if (
    edited.includes("revenueMl") ||
    edited.includes("productCostErp") ||
    edited.includes("taxErp")
  ) {
    delete next.cancelledIncludeOverlay;
  }

  return next;
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000_001;
}

/**
 * Aplica edição manual: grava o valor, garante baseline (se ausente) e
 * marca/desmarca a chave conforme diferença vs baseline.
 */
export function applyManualLineEdit(
  payload: DreMonthSnapshotPayload,
  lineKey: DreEditableLineKey,
  amount: number,
): DreMonthSnapshotPayload {
  const storedAmount =
    lineKey === "adsCost" ? roundMoney(Math.abs(amount)) : roundMoney(amount);

  const previousAmount = getEditableLineAmount(payload, lineKey);
  const baseline: Partial<Record<DreEditableLineKey, number>> = {
    ...(payload.syncedLineBaseline ?? {}),
  };
  if (baseline[lineKey] === undefined) {
    baseline[lineKey] = previousAmount;
  }

  const edited = new Set<DreEditableLineKey>(
    payload.manuallyEditedLineKeys ?? [],
  );
  const baselineAmount = baseline[lineKey] ?? previousAmount;
  if (amountsMatch(storedAmount, baselineAmount)) {
    edited.delete(lineKey);
  } else {
    edited.add(lineKey);
  }

  const next: DreMonthSnapshotPayload = {
    ...payload,
    [lineKey]: storedAmount,
    syncedLineBaseline: baseline,
    manuallyEditedLineKeys: [...edited],
  };

  // Edição manual de faturamento/custo/imposto invalida o overlay de
  // canceladas (senão a leitura somaria de novo o bruto cancelado).
  if (
    lineKey === "revenueMl" ||
    lineKey === "productCostErp" ||
    lineKey === "taxErp"
  ) {
    delete next.cancelledIncludeOverlay;
  }

  return next;
}

/**
 * Restaura uma linha ao valor do último sync (baseline).
 * Retorna null se não houver baseline para a chave.
 */
export function applyRestoreLineFromSync(
  payload: DreMonthSnapshotPayload,
  lineKey: DreEditableLineKey,
): DreMonthSnapshotPayload | null {
  const baselineAmount = payload.syncedLineBaseline?.[lineKey];
  if (baselineAmount === undefined || !Number.isFinite(baselineAmount)) {
    return null;
  }

  const restoredAmount =
    lineKey === "adsCost"
      ? roundMoney(Math.abs(baselineAmount))
      : roundMoney(baselineAmount);

  const edited = (payload.manuallyEditedLineKeys ?? []).filter(
    (key) => key !== lineKey,
  );

  const next: DreMonthSnapshotPayload = {
    ...payload,
    [lineKey]: restoredAmount,
    ...restoreBreakdownField(payload, lineKey),
    manuallyEditedLineKeys: edited,
  };

  if (
    lineKey === "revenueMl" ||
    lineKey === "productCostErp" ||
    lineKey === "taxErp"
  ) {
    delete next.cancelledIncludeOverlay;
  }

  return next;
}

/**
 * Após conciliação aceita: os valores atuais das chaves viram a nova verdade
 * (baseline) e deixam de aparecer como “ajustado”.
 */
export function commitReconciledLinesAsTruth(
  payload: DreMonthSnapshotPayload,
  lineKeys: readonly DreEditableLineKey[],
): DreMonthSnapshotPayload {
  const baseline: Partial<Record<DreEditableLineKey, number>> = {
    ...(payload.syncedLineBaseline ?? {}),
  };
  const edited = new Set(payload.manuallyEditedLineKeys ?? []);
  for (const key of lineKeys) {
    baseline[key] = getEditableLineAmount(payload, key);
    edited.delete(key);
  }
  return {
    ...payload,
    syncedLineBaseline: baseline,
    manuallyEditedLineKeys: [...edited],
  };
}

export type DreManualCostInput = {
  costItemId: string;
  amount: number;
};

/** @deprecated use DreManualCostInput */
export type DreFixedCostInput = DreManualCostInput;

export type DreComputedTotals = {
  totalEntrada: number;
  totalCustoOperacional: number;
  margemContribuicao: number;
  margemContribuicaoPercent: number | null;
  totalCustoFixoManual: number;
  totalCustoOperacionalManual: number;
  totalInvestimentoManual: number;
  adsCost: number;
  totalCustoFixo: number;
  totalInvestimento: number;
  lucroOperacionalAntesInvestimentos: number;
  lucroOperacionalAntesInvestimentosPercent: number | null;
  lucroOperacional: number;
  lucroOperacionalPercent: number | null;
  totalSaidaNaoOperacionalManual: number;
  totalSaidaNaoOperacional: number;
  totalEntradaNaoOperacionalManual: number;
  totalEntradaNaoOperacional: number;
  resultadoLiquido: number;
  resultadoLiquidoPercent: number | null;
};

const OPERATIONAL_LINE_KEYS: (keyof DreLineAmounts)[] = [
  "cancelledSalesMl",
  "saleFeeMl",
  "partialReturnsMl",
  "returnFeeMl",
  "specialFeesMl",
  "productCostErp",
  "taxErp",
  "sellerShippingMl",
  "fullShippingMl",
  "fullStorageMl",
  "fullNonComplianceMl",
  "minhaPaginaMl",
  "affiliateFeeMl",
];

export function percentOfRevenue(
  value: number,
  revenue: number,
): number | null {
  if (revenue <= 0) return null;
  return roundMoney((value / revenue) * 100);
}

export function computeDreTotals(
  lines: DreLineAmounts,
  adsCost: number,
  fixedCosts: DreManualCostInput[],
  operationalCosts: DreManualCostInput[] = [],
  investmentCosts: DreManualCostInput[] = [],
  nonOperationalOutCosts: DreManualCostInput[] = [],
  nonOperationalInCosts: DreManualCostInput[] = [],
): DreComputedTotals {
  const revenueMl = roundMoney(Math.max(0, lines.revenueMl));
  const totalEntrada = revenueMl;

  let totalCustoOperacional = 0;
  for (const key of OPERATIONAL_LINE_KEYS) {
    totalCustoOperacional += lines[key] ?? 0;
  }

  let totalCustoOperacionalManual = 0;
  for (const row of operationalCosts) {
    totalCustoOperacionalManual += Math.max(0, row.amount);
  }
  totalCustoOperacionalManual = roundMoney(-totalCustoOperacionalManual);

  const ads = roundMoney(Math.max(0, adsCost));

  totalCustoOperacional = roundMoney(
    totalCustoOperacional + totalCustoOperacionalManual - ads,
  );

  const margemContribuicao = roundMoney(totalEntrada + totalCustoOperacional);
  const margemContribuicaoPercent = percentOfRevenue(
    margemContribuicao,
    totalEntrada,
  );

  let totalCustoFixoManual = 0;
  for (const row of fixedCosts) {
    totalCustoFixoManual += Math.max(0, row.amount);
  }
  totalCustoFixoManual = roundMoney(totalCustoFixoManual);

  const totalCustoFixo = roundMoney(-totalCustoFixoManual);
  const lucroOperacionalAntesInvestimentos = roundMoney(
    margemContribuicao + totalCustoFixo,
  );
  const lucroOperacionalAntesInvestimentosPercent = percentOfRevenue(
    lucroOperacionalAntesInvestimentos,
    totalEntrada,
  );

  let totalInvestimentoManual = 0;
  for (const row of investmentCosts) {
    totalInvestimentoManual += Math.max(0, row.amount);
  }
  totalInvestimentoManual = roundMoney(totalInvestimentoManual);

  const totalInvestimento = roundMoney(-totalInvestimentoManual);
  const lucroOperacional = roundMoney(
    lucroOperacionalAntesInvestimentos + totalInvestimento,
  );
  const lucroOperacionalPercent = percentOfRevenue(
    lucroOperacional,
    totalEntrada,
  );

  let totalSaidaNaoOperacionalManual = 0;
  for (const row of nonOperationalOutCosts) {
    totalSaidaNaoOperacionalManual += Math.max(0, row.amount);
  }
  totalSaidaNaoOperacionalManual = roundMoney(totalSaidaNaoOperacionalManual);
  const totalSaidaNaoOperacional = roundMoney(-totalSaidaNaoOperacionalManual);

  let totalEntradaNaoOperacionalManual = 0;
  for (const row of nonOperationalInCosts) {
    totalEntradaNaoOperacionalManual += Math.max(0, row.amount);
  }
  totalEntradaNaoOperacionalManual = roundMoney(
    totalEntradaNaoOperacionalManual,
  );
  // Única categoria manual que soma (não subtrai) — dinheiro recebido fora
  // da operação (ex.: venda de imobilizado, reembolso).
  const totalEntradaNaoOperacional = totalEntradaNaoOperacionalManual;

  const resultadoLiquido = roundMoney(
    lucroOperacional + totalSaidaNaoOperacional + totalEntradaNaoOperacional,
  );
  const resultadoLiquidoPercent = percentOfRevenue(
    resultadoLiquido,
    totalEntrada,
  );

  return {
    totalEntrada,
    totalCustoOperacional,
    margemContribuicao,
    margemContribuicaoPercent,
    totalCustoFixoManual,
    totalCustoOperacionalManual,
    totalInvestimentoManual,
    adsCost: ads,
    totalCustoFixo,
    totalInvestimento,
    lucroOperacionalAntesInvestimentos,
    lucroOperacionalAntesInvestimentosPercent,
    lucroOperacional,
    lucroOperacionalPercent,
    totalSaidaNaoOperacionalManual,
    totalSaidaNaoOperacional,
    totalEntradaNaoOperacionalManual,
    totalEntradaNaoOperacional,
    resultadoLiquido,
    resultadoLiquidoPercent,
  };
}

/**
 * Inclui vendas canceladas no faturamento bruto (como o painel ML), mantendo
 * a linha de canceladas nos custos variáveis para abater o resultado.
 *
 * Custo produto e Imposto ML NÃO são ajustados aqui: o cálculo base já exclui
 * pedidos cancelados e devolvidas ligadas à fatura CXC, então não há
 * custo/imposto a neutralizar — diferente da receita, que precisa da
 * linha `cancelledSalesMl` para abater o valor bruto incluído acima.
 */
export function applyDreIncludeCancelledView(
  lines: DreLineAmounts,
  overlay?: DreCancelledIncludeOverlay | null,
): DreLineAmounts {
  const cancelledLine = lines.cancelledSalesMl ?? 0;
  const revenueAdd =
    overlay && overlay.revenueGross > 0
      ? overlay.revenueGross
      : cancelledLine < 0
        ? Math.abs(cancelledLine)
        : 0;

  if (revenueAdd <= 0) {
    return lines;
  }

  return {
    ...lines,
    revenueMl: roundMoney(lines.revenueMl + revenueAdd),
  };
}

export function sumYearLineAmounts(
  months: DreLineAmounts[],
): DreLineAmounts {
  const out: DreLineAmounts = {
    revenueMl: 0,
    cancelledSalesMl: 0,
    saleFeeMl: 0,
    partialReturnsMl: 0,
    returnFeeMl: 0,
    specialFeesMl: 0,
    productCostErp: 0,
    taxErp: 0,
    sellerShippingMl: 0,
    fullShippingMl: 0,
    fullStorageMl: 0,
    fullNonComplianceMl: 0,
    minhaPaginaMl: 0,
    affiliateFeeMl: 0,
  };
  for (const month of months) {
    for (const key of OPERATIONAL_LINE_KEYS) {
      out[key] = roundMoney(out[key] + (month[key] ?? 0));
    }
    out.revenueMl = roundMoney(out.revenueMl + (month.revenueMl ?? 0));
  }
  return out;
}

/** Combina listas de auditoria do Custo produto (ex.: pedidos pagos + cancelados, ou vários meses), somando por SKU/anúncio + origem do custo (nivelado vs cadastro). */
export function mergeProductCostBreakdowns(
  lists: DreProductCostBreakdownItem[][],
): DreProductCostBreakdownItem[] {
  const byKey = new Map<string, DreProductCostBreakdownItem>();
  for (const list of lists) {
    for (const item of list) {
      const mergeKey = normalizeProductCostAuditMergeKey(item);
      const leveled =
        item.leveled === true || mergeKey.includes("::leveled");
      const existing = byKey.get(mergeKey);
      if (!existing) {
        byKey.set(mergeKey, {
          ...item,
          key: mergeKey,
          leveled: leveled || undefined,
          cancelledQuantity: item.cancelledQuantity || undefined,
          cancelledCost: item.cancelledCost || undefined,
        });
        continue;
      }
      existing.quantity += item.quantity;
      existing.totalCost = roundMoney(existing.totalCost + item.totalCost);
      existing.unitCost =
        existing.quantity > 0
          ? roundMoney(existing.totalCost / existing.quantity)
          : 0;
      existing.missingCost = existing.missingCost || item.missingCost;
      existing.leveled = leveled || undefined;
      if (item.cancelledQuantity || item.cancelledCost) {
        existing.cancelledQuantity =
          (existing.cancelledQuantity ?? 0) + (item.cancelledQuantity ?? 0);
        existing.cancelledCost = roundMoney(
          (existing.cancelledCost ?? 0) + (item.cancelledCost ?? 0),
        );
      }
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const skuCmp = (a.sku ?? a.title).localeCompare(b.sku ?? b.title, "pt-BR");
    if (skuCmp !== 0) return skuCmp;
    if (Boolean(a.leveled) !== Boolean(b.leveled)) {
      return a.leveled ? -1 : 1;
    }
    return b.totalCost - a.totalCost;
  });
}

/** Junta a auditoria do Custo produto de todos os meses do ano em uma única lista por SKU/anúncio. */
export function getYearProductCostBreakdown(
  months: Array<{ productCostBreakdown: DreProductCostBreakdownItem[] | null }>,
): DreProductCostBreakdownItem[] {
  const lists = months
    .map((month) => month.productCostBreakdown)
    .filter((list): list is DreProductCostBreakdownItem[] => list !== null);
  return mergeProductCostBreakdowns(lists);
}

/** Combina listas de auditoria do Imposto ML (ex.: pedidos pagos + cancelados, ou vários meses), somando por SKU/anúncio. */
export function mergeTaxBreakdowns(
  lists: DreTaxBreakdownItem[][],
): DreTaxBreakdownItem[] {
  const byKey = new Map<string, DreTaxBreakdownItem>();
  for (const list of lists) {
    for (const item of list) {
      const existing = byKey.get(item.key);
      if (!existing) {
        byKey.set(item.key, { ...item });
        continue;
      }
      existing.quantity += item.quantity;
      existing.revenue = roundMoney(existing.revenue + item.revenue);
      existing.totalTax = roundMoney(existing.totalTax + item.totalTax);
      existing.taxPercent =
        existing.revenue > 0
          ? roundMoney((existing.totalTax / existing.revenue) * 100)
          : null;
      existing.missingTax = existing.missingTax || item.missingTax;
      if (item.cancelledQuantity || item.cancelledRevenue || item.cancelledTax) {
        existing.cancelledQuantity =
          (existing.cancelledQuantity ?? 0) + (item.cancelledQuantity ?? 0);
        existing.cancelledRevenue = roundMoney(
          (existing.cancelledRevenue ?? 0) + (item.cancelledRevenue ?? 0),
        );
        existing.cancelledTax = roundMoney(
          (existing.cancelledTax ?? 0) + (item.cancelledTax ?? 0),
        );
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalTax - a.totalTax);
}

/** Junta a auditoria do Imposto ML de todos os meses do ano em uma única lista por SKU/anúncio. */
export function getYearTaxBreakdown(
  months: Array<{ taxBreakdown: DreTaxBreakdownItem[] | null }>,
): DreTaxBreakdownItem[] {
  const lists = months
    .map((month) => month.taxBreakdown)
    .filter((list): list is DreTaxBreakdownItem[] => list !== null);
  return mergeTaxBreakdowns(lists);
}

/** Combina listas de auditoria genérica (ex.: pedidos pagos + cancelados, ou vários meses), somando por SKU/anúncio. */
export function mergeLineBreakdowns(
  lists: DreLineBreakdownItem[][],
): DreLineBreakdownItem[] {
  const byKey = new Map<string, DreLineBreakdownItem>();
  for (const list of lists) {
    for (const item of list) {
      const existing = byKey.get(item.key);
      if (!existing) {
        byKey.set(item.key, { ...item });
        continue;
      }
      existing.quantity =
        existing.quantity === null && item.quantity === null
          ? null
          : (existing.quantity ?? 0) + (item.quantity ?? 0);
      existing.amount = roundMoney(existing.amount + item.amount);
      if (item.cancelledQuantity || item.cancelledAmount) {
        existing.cancelledQuantity =
          (existing.cancelledQuantity ?? 0) + (item.cancelledQuantity ?? 0);
        existing.cancelledAmount = roundMoney(
          (existing.cancelledAmount ?? 0) + (item.cancelledAmount ?? 0),
        );
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.amount - a.amount);
}

/** Junta uma auditoria genérica de todos os meses do ano em uma única lista por SKU/anúncio. */
export function getYearLineBreakdown(
  lists: Array<DreLineBreakdownItem[] | null>,
): DreLineBreakdownItem[] {
  const nonNull = lists.filter(
    (list): list is DreLineBreakdownItem[] => list !== null,
  );
  return mergeLineBreakdowns(nonNull);
}
