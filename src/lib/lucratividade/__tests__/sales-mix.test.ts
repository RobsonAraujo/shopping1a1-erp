import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFinancialMargin, roundMoney } from "@/lib/pricing/financial-margin";
import {
  averageShippingPerUnit,
  buildSalesMixTable,
  computeChannelSplit,
  createSalesMixAccumulator,
  describeMarginPrecision,
  describeSalesMixRow,
  salesMixLogisticFromShipmentType,
  type SalesMixEntry,
  type SalesMixRowInput,
} from "../sales-mix";

function entry(
  overrides: Partial<SalesMixEntry> & Pick<SalesMixEntry, "channel" | "units">,
  unitPrice: number,
  feePerUnit: number | null,
): SalesMixEntry {
  return {
    listingTypeId: "gold_special",
    orders: overrides.units,
    revenue: roundMoney(unitPrice * overrides.units),
    saleFeeSum: feePerUnit === null ? 0 : roundMoney(feePerUnit * overrides.units),
    saleFeeKnownQty: feePerUnit === null ? 0 : overrides.units,
    minUnitPrice: unitPrice,
    maxUnitPrice: unitPrice,
    ...overrides,
    flexUnits: overrides.flexUnits ?? (overrides.logistic === "flex" ? overrides.units : 0),
  };
}

/**
 * Linha de período montada como `buildRowForPeriodItem`: média das vendas +
 * custos do cadastro; frete = média (cotação 7,35 e Flex sem frete).
 */
function periodRow(
  entries: SalesMixEntry[],
  opts: { productCost?: number | null; taxRatePercent?: number | null; pending?: boolean } = {},
): SalesMixRowInput {
  const units = entries.reduce((s, e) => s + e.units, 0);
  const revenue = entries.reduce((s, e) => s + e.revenue, 0);
  const feeSum = entries.reduce((s, e) => s + e.saleFeeSum, 0);
  const feeQty = entries.reduce((s, e) => s + e.saleFeeKnownQty, 0);
  const productCost = opts.productCost === undefined ? 18.42 : opts.productCost;
  const taxRatePercent = opts.taxRatePercent === undefined ? 1.64 : opts.taxRatePercent;
  const salePrice = roundMoney(revenue / units);
  const mlFeeAmount = feeQty > 0 ? roundMoney(feeSum / feeQty) : 3.5;
  const flexUnits = entries.reduce((s, e) => s + e.flexUnits, 0);
  const shippingCost = averageShippingPerUnit(7.35, units, flexUnits);
  const breakdown = computeFinancialMargin({
    salePrice,
    mlFeeAmount,
    mlFeeRebate: 0,
    shippingCost,
    productCost,
    extraCosts: 0.3,
    taxRatePercent,
  });
  return {
    pending: opts.pending,
    breakdown,
    productCost,
    taxRatePercent,
    kitMissingSkus: [],
    adsMetricsAvailable: false,
    marginAfterAdsPercent: null,
    marginAfterAdsValue: null,
    periodUnitsSold: units,
    periodRevenue: roundMoney(revenue),
    shippingCost,
    shippingQuoteCost: 7.35,
    mlFeeAmount,
    extraCosts: 0.3,
    listingTypeId: "gold_special",
    salePrice,
    // a linha do período não tem a forma de envio (só o painel traz), mas
    // cada entrada mantém as suas un. Flex
    salesMix: entries.map((e) => {
      const copy = { ...e };
      delete copy.logistic;
      return copy;
    }),
  };
}

// As 39 un. do Alltec em 17/11 até 17:49 (pedidos reais).
const alltec: SalesMixEntry[] = [
  entry({ channel: "retail", logistic: "full", units: 28 }, 29.87, 3.58),
  entry({ channel: "retail", logistic: "flex", units: 2 }, 29.87, 10.23),
  entry({ channel: "b2b", logistic: "full", units: 9 }, 27.85, 3.34),
];

describe("averageShippingPerUnit", () => {
  it("Flex units pay no freight; the rest pay the quote", () => {
    assert.equal(averageShippingPerUnit(8.45, 81, 9), 7.51);
    assert.equal(averageShippingPerUnit(8.45, 5, 0), 8.45);
    assert.equal(averageShippingPerUnit(8.45, 5, 5), 0);
    // nunca passa das unidades nem fica negativo
    assert.equal(averageShippingPerUnit(8.45, 2, 7), 0);
    assert.equal(averageShippingPerUnit(8.45, 2, -1), 8.45);
    assert.equal(averageShippingPerUnit(8.45, 0, 0), 8.45);
  });
});

describe("salesMixLogisticFromShipmentType", () => {
  it("maps ML logistic types to Full/Flex/Coleta", () => {
    assert.equal(salesMixLogisticFromShipmentType("fulfillment"), "full");
    assert.equal(salesMixLogisticFromShipmentType("self_service"), "flex");
    assert.equal(salesMixLogisticFromShipmentType("xd_drop_off"), "coleta");
    assert.equal(salesMixLogisticFromShipmentType("cross_docking"), "coleta");
    assert.equal(salesMixLogisticFromShipmentType("drop_off"), "coleta");
    assert.equal(salesMixLogisticFromShipmentType("default"), "other");
    assert.equal(salesMixLogisticFromShipmentType(null), "unclassified");
  });
});

describe("createSalesMixAccumulator", () => {
  it("sums per key, tracks price range and sorts by units", () => {
    const acc = createSalesMixAccumulator();
    const sale = { channel: "retail" as const, listingTypeId: "gold_special", logistic: "full" as const };
    acc.add({ ...sale, quantity: 1, revenue: 29.87, unitPrice: 29.87, saleFeePerUnit: 3.58 });
    acc.add({ ...sale, quantity: 3, revenue: 83.55, unitPrice: 27.85, saleFeePerUnit: null });
    acc.add({ ...sale, logistic: "flex", quantity: 1, revenue: 29.87, unitPrice: 29.87, saleFeePerUnit: 10.23 });
    const [full, flex] = acc.entries();
    assert.equal(full?.logistic, "full");
    assert.equal(full?.units, 4);
    assert.equal(full?.orders, 2);
    assert.equal(full?.revenue, 113.42);
    assert.equal(full?.saleFeeKnownQty, 1); // a venda sem sale_fee não entra na tarifa
    assert.equal(full?.minUnitPrice, 27.85);
    assert.equal(full?.maxUnitPrice, 29.87);
    assert.equal(flex?.logistic, "flex");
    // sem `flexUnits`, a venda Flex conta todas as unidades
    assert.equal(full?.flexUnits, 0);
    assert.equal(flex?.flexUnits, 1);
  });

  it("period sales (no logistic) carry their own Flex units", () => {
    const acc = createSalesMixAccumulator();
    const sale = { channel: "retail" as const, listingTypeId: "gold_special", unitPrice: 64.59 };
    acc.add({ ...sale, quantity: 1, revenue: 64.59, saleFeePerUnit: 16.15, flexUnits: 1 });
    acc.add({ ...sale, quantity: 2, revenue: 134.74, saleFeePerUnit: 8.76, flexUnits: 0 });
    const [only] = acc.entries();
    assert.equal(only?.units, 3);
    assert.equal(only?.flexUnits, 1);
  });
});

describe("buildSalesMixTable", () => {
  it("closes on the listing's own margin (price, fee and Flex freight change per modality)", () => {
    const row = periodRow(alltec);
    // 2 de 39 un. Flex: frete médio 7,35 × 37/39
    assert.equal(row.shippingCost, 6.97);
    const table = buildSalesMixTable(row, alltec);
    const byLabel = new Map(table.rows.map((r) => [r.label, r]));
    assert.equal(byLabel.get("Varejo · Flex")?.shippingPerUnit, 0);
    assert.equal(byLabel.get("Varejo · Full")?.shippingPerUnit, 7.35);
    const mixTotal = table.rows.reduce((s, r) => s + (r.marginValue ?? 0) * r.units, 0);
    const rowTotal = row.breakdown!.marginValue * row.periodUnitsSold!;
    // arredondamento de centavos por unidade (preço/tarifa médios da linha)
    assert.ok(Math.abs(mixTotal - rowTotal) < 0.5, `${mixTotal} vs ${rowTotal}`);
    assert.equal(table.total.units, 39);
    assert.equal(table.total.marginValue, row.breakdown!.marginValue);
    assert.equal(table.unitsDiff, 0);
    assert.equal(table.marginAvailable, true);
  });

  it("explains the −3,40% case: the B2B price pulls the average down; Flex pays no freight", () => {
    const table = buildSalesMixTable(periodRow(alltec), alltec);
    const byLabel = new Map(table.rows.map((r) => [r.label, r]));
    const full = byLabel.get("Varejo · Full");
    const flex = byLabel.get("Varejo · Flex");
    const b2b = byLabel.get("B2B · Full");
    assert.ok(full && flex && b2b);
    assert.equal(flex.feePerUnit, 10.23);
    assert.equal(flex.shippingPerUnit, 0);
    assert.equal(b2b.averagePrice, 27.85);
    // custo fixo do Flex (6,65) < frete do Full (7,35): o Flex não puxa mais a média
    assert.ok(flex.marginPercent! > full.marginPercent!);
    assert.ok(b2b.marginPercent! < full.marginPercent!);
    assert.ok(table.total.marginPercent! < full.marginPercent!);
    assert.equal(table.hasFlex, true);
    assert.equal(table.showsListingType, false);
  });

  it("labels the listing type when the period mixes Clássico and Premium", () => {
    const entries = [
      entry({ channel: "retail", units: 5 }, 29.87, 3.58),
      entry({ channel: "retail", units: 1, listingTypeId: "gold_pro" }, 36.54, 6.21),
    ];
    const table = buildSalesMixTable(periodRow(entries), entries);
    assert.equal(table.showsListingType, true);
    assert.deepEqual(
      table.rows.map((r) => r.label),
      ["Varejo · Clássico", "Varejo · Premium"],
    );
  });

  it("falls back to the listing fee when a modality has no sale_fee", () => {
    const entries = [
      entry({ channel: "retail", units: 3 }, 29.87, 3.58),
      entry({ channel: "b2b", units: 1 }, 27.85, null),
    ];
    const row = periodRow(entries);
    const table = buildSalesMixTable(row, entries);
    const b2b = table.rows.find((r) => r.channel === "b2b");
    assert.equal(b2b?.feePerUnit, row.mlFeeAmount);
    assert.equal(b2b?.feeFromRow, true);
    assert.equal(table.feeFromRow, true);
  });

  it("shows no margin when the listing is out of the average", () => {
    const row = periodRow(alltec, { productCost: null });
    const table = buildSalesMixTable(row, alltec);
    assert.equal(table.marginAvailable, false);
    assert.ok(table.rows.every((r) => r.marginValue === null && r.marginPercent === null));
    assert.equal(table.total.marginValue, null);
    // vendas e tarifa continuam aparecendo
    assert.equal(table.rows[0]?.units, 28);
    assert.equal(table.rows[0]?.feePerUnit, 3.58);
  });

  it("flags unclassified units and orders that changed since the page loaded", () => {
    const entries = [
      ...alltec,
      entry({ channel: "retail", logistic: "unclassified", units: 2 }, 29.87, 3.58),
    ];
    const table = buildSalesMixTable(periodRow(alltec), entries);
    assert.equal(table.unclassifiedUnits, 2);
    assert.equal(table.unitsDiff, 2);
  });
});

describe("computeChannelSplit", () => {
  it("splits revenue over all rows but margin only over rows in the average", () => {
    const outOfAverage = [entry({ channel: "retail", units: 10 }, 30, 3.6)];
    const split = computeChannelSplit([
      periodRow(alltec),
      periodRow(outOfAverage, { productCost: null }),
    ]);
    const retail = split.items.find((i) => i.channel === "retail")!;
    const b2b = split.items.find((i) => i.channel === "b2b")!;
    assert.equal(split.hasB2b, true);
    assert.equal(retail.units, 40);
    assert.equal(retail.revenue, roundMoney(30 * 29.87 + 300));
    assert.equal(b2b.revenue, 250.65);
    assert.ok(Math.abs(retail.revenueShare! + b2b.revenueShare! - 100) < 0.02);
    // margem do varejo = só as 30 un. do Alltec (a outra linha está fora da média)
    const alltecRetail = buildSalesMixTable(periodRow(alltec), [
      {
        ...entry({ channel: "retail", units: 30 }, 29.87, 0),
        saleFeeSum: 120.7,
        saleFeeKnownQty: 30,
        flexUnits: 2,
      },
    ]).rows[0]!;
    assert.equal(retail.marginValue, roundMoney(alltecRetail.marginValue! * 30));
    assert.ok(b2b.marginPercent! < retail.marginPercent!);
  });

  it("skips pending rows and reports no B2B when there is none", () => {
    const retailOnly = [entry({ channel: "retail", units: 4 }, 29.87, 3.58)];
    const split = computeChannelSplit([
      periodRow(retailOnly),
      periodRow(alltec, { pending: true }),
    ]);
    assert.equal(split.hasB2b, false);
    assert.equal(split.items.find((i) => i.channel === "retail")?.units, 4);
    assert.equal(split.items.find((i) => i.channel === "b2b")?.marginPercent, null);
  });
});

describe("describeSalesMixRow — o que cada modalidade usou", () => {
  const fullListing = { shippingCost: 7.35, listingLogistic: "full" as const, shipmentsCapped: false };

  it("Flex: no freight (the shipping bonus pays the delivery) and what is coming", () => {
    const e = describeSalesMixRow({ channel: "retail", logistic: "flex", feeFromRow: false }, fullListing);
    assert.equal(e.shippingNote, "sem frete: o bônus de envio paga a entrega");
    assert.ok(e.lines.some((l) => /^Frete: R\$ 0\./.test(l) && /nem o frete nem o bônus entram na conta/.test(l)));
    assert.ok(!e.lines.some((l) => /frete padrão do Full/.test(l)));
    assert.ok(e.lines.some((l) => /custo fixo por unidade/.test(l)));
    assert.equal(e.comingSoon, "cadastrar o custo da sua entrega Flex.");
  });

  it("Full on a Full listing: no borrowed shipping, no 'em breve'", () => {
    const e = describeSalesMixRow({ channel: "retail", logistic: "full", feeFromRow: false }, fullListing);
    assert.equal(e.shippingNote, null);
    assert.equal(e.comingSoon, null);
    assert.ok(e.lines.some((l) => /cotado pelo Mercado Livre/.test(l)));
  });

  it("Coleta on a Full listing borrows the Full shipping until real shipping per order exists", () => {
    const e = describeSalesMixRow({ channel: "b2b", logistic: "coleta", feeFromRow: false }, fullListing);
    assert.match(e.shippingNote ?? "", /frete padrão do Full do anúncio/);
    assert.equal(e.comingSoon, "frete real de cada pedido.");
    assert.ok(e.lines[0]?.startsWith("B2B:"));
  });

  it("unclassified mentions the shipment cap; unknown listing shipping stays generic", () => {
    const capped = describeSalesMixRow(
      { channel: "retail", logistic: "unclassified", feeFromRow: false },
      { ...fullListing, shipmentsCapped: true },
    );
    assert.ok(capped.lines.some((l) => /limite de 1\.500 envios/.test(l)));
    const unknown = describeSalesMixRow(
      { channel: "retail", logistic: "full", feeFromRow: false },
      { shippingCost: 7.35, listingLogistic: null, shipmentsCapped: false },
    );
    assert.match(unknown.shippingNote ?? "", /^usa a cotação de frete padrão do anúncio/);
  });

  it("explains the fee fallback and channel-only rows (before shipping loads)", () => {
    const e = describeSalesMixRow({ channel: "retail", logistic: null, feeFromRow: true }, fullListing);
    assert.equal(e.shippingNote, null);
    assert.ok(e.lines.some((l) => /vieram sem tarifa/.test(l)));
    assert.ok(e.lines.some((l) => /igual para todas as vendas/.test(l)));
  });
});

describe("describeMarginPrecision — o que é real e o que é estimado", () => {
  const row = {
    shippingCost: 7.35,
    productCost: 18.42,
    extraCosts: 0.3,
    taxRatePercent: 1.64,
    isKitComposition: false,
  };

  it("lists every component with its status and what is coming", () => {
    const items = describeMarginPrecision(row, {
      taxRegime: "LUCRO_REAL",
      listingLogistic: "full",
      feeFromRow: false,
    });
    assert.deepEqual(
      items.map((i) => [i.key, i.status]),
      [
        ["price", "real"],
        ["fee", "real"],
        ["shipping", "estimated"],
        ["cost", "estimated"],
        ["tax", "estimated"],
        ["returns", "not_applied"],
        ["ads", "outside"],
      ],
    );
    const byKey = new Map(items.map((i) => [i.key, i]));
    assert.match(byKey.get("shipping")!.detail, /^O frete padrão do Full do anúncio \(R\$\s7,35\/un\.\)/);
    assert.match(byKey.get("shipping")!.detail, /igual para todas as vendas/);
    assert.match(byKey.get("cost")!.detail, /Cadastro atual \(R\$\s18,72\/un\./);
    assert.match(byKey.get("tax")!.detail, /Tributário.*1,64%/);
    assert.equal(byKey.get("tax")!.comingSoon, "imposto de cada venda.");
    assert.equal(byKey.get("returns")!.comingSoon, "descontar as devoluções.");
  });

  it("shipping: quotes the listing freight and says Flex units have none", () => {
    const shipping = describeMarginPrecision(
      { ...row, shippingCost: 6.97, shippingQuoteCost: 7.35, periodFlexUnits: 2 },
      { taxRegime: "LUCRO_REAL", listingLogistic: "full", feeFromRow: false },
    ).find((i) => i.key === "shipping")!;
    assert.match(shipping.detail, /^O frete padrão do Full do anúncio \(R\$\s7,35\/un\.\).*nas vendas que não são Flex/);
    assert.match(shipping.detail, /Flex \(2 un\.\) entram sem frete: o bônus de envio paga a entrega/);
  });

  it("Simples uses the company rate and has nothing coming for tax", () => {
    const tax = describeMarginPrecision(row, {
      taxRegime: "SIMPLES",
      listingLogistic: "full",
      feeFromRow: false,
    }).find((i) => i.key === "tax")!;
    assert.match(tax.detail, /Alíquota efetiva do Simples/);
    assert.equal(tax.comingSoon, null);
  });

  it("kit cost, missing cost/tax and the fee fallback", () => {
    const kit = describeMarginPrecision({ ...row, isKitComposition: true }, {
      taxRegime: "LUCRO_REAL",
      listingLogistic: "full",
      feeFromRow: true,
    });
    assert.match(kit.find((i) => i.key === "cost")!.detail, /^Composição do kit/);
    assert.match(kit.find((i) => i.key === "fee")!.detail, /sem tarifa usam a média/);
    const missing = describeMarginPrecision({ ...row, productCost: null, taxRatePercent: null }, {
      taxRegime: "LUCRO_REAL",
      listingLogistic: null,
      feeFromRow: false,
    });
    assert.match(missing.find((i) => i.key === "cost")!.detail, /Sem custo cadastrado/);
    assert.match(missing.find((i) => i.key === "tax")!.detail, /Sem alíquota/);
    assert.match(missing.find((i) => i.key === "shipping")!.detail, /^A cotação de frete padrão do anúncio/);
  });
});
