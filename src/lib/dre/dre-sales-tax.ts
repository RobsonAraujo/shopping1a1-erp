import { roundMoney } from "@/lib/pricing/financial-margin";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import type {
  DreTaxBreakdownItem,
  DreTaxRateSource,
  DreTaxSource,
} from "@/lib/dre/dre-calculations";

/**
 * Imposto sobre vendas do DRE — uma função só, usada pelo sync do mês e pelo
 * "Atualizar imposto" (que recalcula só a partir da auditoria salva, sem ML).
 *
 * A fonte da verdade do % é o relatório tributário: ele calcula venda a venda
 * (UF de destino, contribuinte, ICMS/DIFAL, PIS/COFINS e créditos). O DRE só
 * aplica o % de cada anúncio à receita do anúncio no mês, sem as vendas
 * canceladas e devolvidas. Por isso a conta que fecha é
 * "imposto do tributário − imposto das devolvidas pagas = imposto do DRE".
 */

/** active = entra no imposto; cancelled/returned só aparecem na auditoria. */
export type DreTaxLineKind = "active" | "cancelled" | "returned";

export type DreTaxLine = {
  /** Chave da auditoria (`item:MLB…`, `kit:MLB…`). */
  key: string;
  itemId: string | null;
  sku: string | null;
  title: string;
  quantity: number;
  revenue: number;
  kind: DreTaxLineKind;
  /** Kit sem % próprio no tributário: média dos componentes (ponderada pelo custo). */
  kitComponentsRatePercent?: number | null;
};

/** % de um anúncio num relatório tributário (sem arredondar). */
export type DreTaxRateEntry = {
  ratePercent: number;
  year: number;
  month: number;
};

export type DreTaxRates = {
  year: number;
  month: number;
  regime: "LUCRO_REAL" | "SIMPLES";
  /** Alíquota efetiva do DAS (só Simples). */
  simplesRatePercent: number | null;
  byMlItemId: ReadonlyMap<string, DreTaxRateEntry>;
  bySku: ReadonlyMap<string, DreTaxRateEntry>;
  /** Relatório tributário do próprio mês (null = mês sem relatório). */
  report: DreTaxSource["report"];
};

export function resolveDreTaxRate(
  line: Pick<DreTaxLine, "itemId" | "sku" | "kitComponentsRatePercent">,
  rates: DreTaxRates,
): { ratePercent: number; source?: DreTaxRateSource } | null {
  if (rates.regime === "SIMPLES") {
    return rates.simplesRatePercent === null
      ? null
      : { ratePercent: rates.simplesRatePercent, source: { kind: "simples" } };
  }
  const entry =
    (line.itemId ? rates.byMlItemId.get(line.itemId) : undefined) ??
    (line.sku ? rates.bySku.get(normalizeProductSku(line.sku)) : undefined);
  if (entry) {
    const sameMonth = entry.year === rates.year && entry.month === rates.month;
    return {
      ratePercent: entry.ratePercent,
      source: sameMonth
        ? undefined
        : { kind: "report", year: entry.year, month: entry.month },
    };
  }
  if (
    line.kitComponentsRatePercent !== null &&
    line.kitComponentsRatePercent !== undefined &&
    Number.isFinite(line.kitComponentsRatePercent)
  ) {
    return {
      ratePercent: line.kitComponentsRatePercent,
      source: { kind: "kit_components" },
    };
  }
  return null;
}

export type DreSalesTaxResult = {
  /** Linha do DRE: negativa, com piso em zero (mês com crédito líquido = 0). */
  taxErp: number;
  /** Soma das vendas ativas, positiva, antes do piso. */
  computedTax: number;
  taxBreakdown: DreTaxBreakdownItem[];
  baseRevenue: number;
  returnedPaidRevenue: number;
  returnedPaidTax: number;
  /** Anúncios (com venda ativa) sem % nenhum — imposto 0 neles. */
  missingItemCount: number;
  missingRevenue: number;
  /** Anúncios que usaram o % de um relatório de outro mês. */
  fallbackItemCount: number;
};

type Accumulator = DreTaxBreakdownItem & { rawTax: number };

/**
 * Aplica o % de cada anúncio à sua receita. Não depende de custo cadastrado
 * (o imposto existe com ou sem custo) e aceita % negativo: crédito de um
 * produto abate o débito dos outros na apuração do mês, como no tributário.
 */
export function computeDreSalesTax(
  lines: readonly DreTaxLine[],
  rates: DreTaxRates,
): DreSalesTaxResult {
  const byKey = new Map<string, Accumulator>();
  let rawActiveTax = 0;
  let baseRevenue = 0;
  let returnedPaidRevenue = 0;
  let returnedPaidTax = 0;
  const missingKeys = new Set<string>();
  const fallbackKeys = new Set<string>();
  let missingRevenue = 0;

  for (const line of lines) {
    const resolved = resolveDreTaxRate(line, rates);
    const tax = resolved ? line.revenue * (resolved.ratePercent / 100) : 0;
    let item = byKey.get(line.key);
    if (!item) {
      item = {
        key: line.key,
        sku: line.sku,
        title: line.title,
        quantity: 0,
        revenue: 0,
        taxPercent: null,
        totalTax: 0,
        missingTax: false,
        rawTax: 0,
      };
      byKey.set(line.key, item);
    }

    if (line.kind === "active") {
      item.quantity += line.quantity;
      item.revenue += line.revenue;
      item.rawTax += tax;
      rawActiveTax += tax;
      baseRevenue += line.revenue;
      if (!resolved) {
        item.missingTax = true;
        if (line.revenue > 0) {
          missingKeys.add(line.key);
          missingRevenue += line.revenue;
        }
      } else if (resolved.source?.kind === "report") {
        fallbackKeys.add(line.key);
      }
    } else if (line.kind === "cancelled") {
      item.cancelledQuantity = (item.cancelledQuantity ?? 0) + line.quantity;
      item.cancelledRevenue = (item.cancelledRevenue ?? 0) + line.revenue;
      item.cancelledTax = (item.cancelledTax ?? 0) + tax;
    } else {
      item.returnedQuantity = (item.returnedQuantity ?? 0) + line.quantity;
      item.returnedRevenue = (item.returnedRevenue ?? 0) + line.revenue;
      item.returnedTax = (item.returnedTax ?? 0) + tax;
      returnedPaidRevenue += line.revenue;
      returnedPaidTax += tax;
    }
    if (resolved?.source && !item.rateSource) item.rateSource = resolved.source;
  }

  const taxBreakdown: DreTaxBreakdownItem[] = [...byKey.values()]
    .map(({ rawTax, ...item }) => {
      const revenue = roundMoney(item.revenue);
      const totalTax = roundMoney(rawTax);
      return {
        ...item,
        revenue,
        totalTax,
        taxPercent: revenue > 0 ? roundMoney((rawTax / item.revenue) * 100) : null,
        cancelledRevenue:
          item.cancelledRevenue === undefined
            ? undefined
            : roundMoney(item.cancelledRevenue),
        cancelledTax:
          item.cancelledTax === undefined ? undefined : roundMoney(item.cancelledTax),
        returnedRevenue:
          item.returnedRevenue === undefined
            ? undefined
            : roundMoney(item.returnedRevenue),
        returnedTax:
          item.returnedTax === undefined ? undefined : roundMoney(item.returnedTax),
      };
    })
    .sort((a, b) => b.totalTax - a.totalTax);

  return {
    taxErp: rawActiveTax > 0 ? roundMoney(-rawActiveTax) : 0,
    computedTax: roundMoney(rawActiveTax),
    taxBreakdown,
    baseRevenue: roundMoney(baseRevenue),
    returnedPaidRevenue: roundMoney(returnedPaidRevenue),
    returnedPaidTax: roundMoney(returnedPaidTax),
    missingItemCount: missingKeys.size,
    missingRevenue: roundMoney(missingRevenue),
    fallbackItemCount: fallbackKeys.size,
  };
}

/**
 * Chave da auditoria → anúncio. `missing:` vinha de snapshots antigos (anúncio
 * sem custo, que ficava sem imposto) — hoje o imposto independe do custo e a
 * linha volta a ser `item:`. Chaves só com texto de SKU (snapshots de antes da
 * identidade por anúncio) não têm anúncio: casam pelo SKU.
 */
export function parseDreTaxBreakdownKey(key: string): {
  key: string;
  itemId: string | null;
} {
  const match = /^(item|kit|missing):(.+)$/.exec(key);
  if (!match) return { key, itemId: null };
  const [, prefix, itemId] = match;
  return { key: prefix === "kit" ? key : `item:${itemId}`, itemId: itemId! };
}

/**
 * Remonta as linhas do imposto a partir da auditoria salva do mês — o
 * "Atualizar imposto" troca só o %, sem buscar pedidos no ML. Receita e
 * quantidade por anúncio já estão na auditoria; cancelados e devolvidos
 * continuam fora do total.
 */
export function taxLinesFromBreakdown(
  items: readonly DreTaxBreakdownItem[],
  kitComponentsRateByItemId: ReadonlyMap<string, number | null> = new Map(),
): DreTaxLine[] {
  const lines: DreTaxLine[] = [];
  for (const item of items) {
    const { key, itemId } = parseDreTaxBreakdownKey(item.key);
    const base = {
      key,
      itemId,
      sku: item.sku,
      title: item.title,
      kitComponentsRatePercent:
        itemId && key.startsWith("kit:")
          ? (kitComponentsRateByItemId.get(itemId) ?? null)
          : undefined,
    };
    if (item.quantity !== 0 || item.revenue !== 0) {
      lines.push({
        ...base,
        quantity: item.quantity,
        revenue: item.revenue,
        kind: "active",
      });
    }
    if (item.cancelledQuantity || item.cancelledRevenue) {
      lines.push({
        ...base,
        quantity: item.cancelledQuantity ?? 0,
        revenue: item.cancelledRevenue ?? 0,
        kind: "cancelled",
      });
    }
    if (item.returnedQuantity || item.returnedRevenue) {
      lines.push({
        ...base,
        quantity: item.returnedQuantity ?? 0,
        revenue: item.returnedRevenue ?? 0,
        kind: "returned",
      });
    }
  }
  return lines;
}

export function buildDreTaxSource(input: {
  result: DreSalesTaxResult;
  rates: DreTaxRates;
  paidOrderCount: number | null;
  previousTaxErp: number | null;
  origin: DreTaxSource["origin"];
  now?: Date;
}): DreTaxSource {
  const { result, rates } = input;
  return {
    regime: rates.regime,
    report: rates.regime === "SIMPLES" ? null : rates.report,
    simplesRatePercent: rates.regime === "SIMPLES" ? rates.simplesRatePercent : null,
    paidOrderCount: input.paidOrderCount,
    baseRevenue: result.baseRevenue,
    computedTax: result.computedTax,
    returnedPaidRevenue: result.returnedPaidRevenue,
    returnedPaidTax: result.returnedPaidTax,
    fallbackItemCount: result.fallbackItemCount,
    missingItemCount: result.missingItemCount,
    missingRevenue: result.missingRevenue,
    computedAt: (input.now ?? new Date()).toISOString(),
    previousTaxErp: input.previousTaxErp,
    origin: input.origin,
  };
}

/**
 * A conta que liga as duas telas: imposto do tributário − imposto das
 * devolvidas pagas (que estão no tributário mas saem do DRE) = imposto do DRE.
 * O que sobra (`other`) é explicado por pedidos que mudaram depois do
 * relatório, anúncios com % de outro mês ou sem %.
 */
export type DreTaxBridge = {
  reportTax: number;
  returnedPaidTax: number;
  other: number;
  dreTax: number;
  /** `other` dentro da tolerância (max R$ 5; 0,5% do imposto). */
  closes: boolean;
};

export function buildDreTaxBridge(
  source: Pick<DreTaxSource, "report" | "returnedPaidTax" | "computedTax">,
): DreTaxBridge | null {
  if (!source.report) return null;
  const reportTax = roundMoney(source.report.tax);
  const returnedPaidTax = roundMoney(source.returnedPaidTax);
  const dreTax = roundMoney(source.computedTax);
  const other = roundMoney(dreTax - (reportTax - returnedPaidTax));
  const tolerance = Math.max(5, Math.abs(reportTax) * 0.005);
  return {
    reportTax,
    returnedPaidTax,
    other,
    dreTax,
    closes: Math.abs(other) <= tolerance,
  };
}
