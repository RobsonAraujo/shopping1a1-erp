import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDreTableRows,
  filterRowsByVisibility,
  rowBackgroundClass,
  rowLabelClass,
  valueToneClass,
  getCellValue,
  isDetailRow,
  dreMonthHeaderColorClass,
  dreMonthShortLabel,
  DRE_STATIC_ROWS,
  type DreTableRow,
} from "../dre-table-rows";
import type { DreCostItemView, DreMonthView } from "../dre-year-data";

const costItems: DreCostItemView[] = [
  { id: "c1", name: "Aluguel", sortOrder: 1, recurring: true },
];
const operationalItems: DreCostItemView[] = [
  { id: "o1", name: "Salários", sortOrder: 1, recurring: true },
];
const investmentItems: DreCostItemView[] = [
  { id: "i1", name: "Marketing institucional", sortOrder: 1, recurring: true },
];
const nonOperationalOutItems: DreCostItemView[] = [
  { id: "no1", name: "Multa", sortOrder: 1, recurring: false },
];
const nonOperationalInItems: DreCostItemView[] = [
  { id: "ni1", name: "Venda de imobilizado", sortOrder: 1, recurring: false },
];

describe("buildDreTableRows", () => {
  it("returns only top-level (non-indented) rows when showDetails is false", () => {
    const rows = buildDreTableRows(
      costItems,
      operationalItems,
      investmentItems,
      [],
      [],
      false,
    );
    assert.ok(rows.every((r) => !("indent" in r) || !r.indent));
    // custom fixed/operational/investment cost rows never appear without details
    assert.ok(!rows.some((r) => r.type === "fixed-cost"));
    assert.ok(!rows.some((r) => r.type === "operational-cost"));
    assert.ok(!rows.some((r) => r.type === "investment-cost"));
  });

  it("includes fixed-cost, operational-cost and investment-cost rows when showDetails is true", () => {
    const rows = buildDreTableRows(
      costItems,
      operationalItems,
      investmentItems,
      [],
      [],
      true,
    );
    const fixed = rows.find((r) => r.type === "fixed-cost");
    const operational = rows.find((r) => r.type === "operational-cost");
    const investment = rows.find((r) => r.type === "investment-cost");
    assert.ok(fixed);
    assert.equal(fixed.costItemId, "c1");
    assert.ok(operational);
    assert.equal(operational.costItemId, "o1");
    assert.ok(investment);
    assert.equal(investment.costItemId, "i1");
  });

  it("places operational-cost rows right before margemContribuicao", () => {
    const rows = buildDreTableRows(
      costItems,
      operationalItems,
      investmentItems,
      [],
      [],
      true,
    );
    const marginIndex = rows.findIndex((r) => r.id === "margemContribuicao");
    const opIndex = rows.findIndex((r) => r.type === "operational-cost");
    assert.ok(opIndex >= 0 && opIndex < marginIndex);
  });

  it("places fixed-cost rows right after totalCustoFixo", () => {
    const rows = buildDreTableRows(
      costItems,
      operationalItems,
      investmentItems,
      [],
      [],
      true,
    );
    const totalIndex = rows.findIndex((r) => r.id === "totalCustoFixo");
    const fixedIndex = rows.findIndex((r) => r.type === "fixed-cost");
    assert.equal(fixedIndex, totalIndex + 1);
  });

  it("places investment-cost rows right after totalInvestimento", () => {
    const rows = buildDreTableRows(
      costItems,
      operationalItems,
      investmentItems,
      [],
      [],
      true,
    );
    const totalIndex = rows.findIndex((r) => r.id === "totalInvestimento");
    const investmentIndex = rows.findIndex((r) => r.type === "investment-cost");
    assert.equal(investmentIndex, totalIndex + 1);
  });

  it("includes visible partial returns row after cancelled sales", () => {
    const rows = buildDreTableRows([], [], [], [], [], true);
    const cancelledIndex = rows.findIndex((r) => r.id === "cancelledSalesMl");
    const partialIndex = rows.findIndex((r) => r.id === "partialReturnsMl");
    assert.ok(partialIndex >= 0);
    assert.equal(partialIndex, cancelledIndex + 1);
    const partial = rows[partialIndex];
    assert.equal(partial.type, "static");
    if (partial.type === "static") {
      assert.equal(partial.lineKey, "partialReturnsMl");
    }
  });

  it("produces the same number of static rows as DRE_STATIC_ROWS when there are no custom cost items", () => {
    const rows = buildDreTableRows([], [], [], [], [], true);
    assert.equal(rows.length, DRE_STATIC_ROWS.length);
  });

  it("places non-operational-out/in-cost rows right after their totals", () => {
    const rows = buildDreTableRows(
      costItems,
      operationalItems,
      investmentItems,
      nonOperationalOutItems,
      nonOperationalInItems,
      true,
    );
    const outTotalIndex = rows.findIndex(
      (r) => r.id === "totalSaidaNaoOperacional",
    );
    const outRowIndex = rows.findIndex(
      (r) => r.type === "non-operational-out-cost",
    );
    assert.equal(outRowIndex, outTotalIndex + 1);

    const inTotalIndex = rows.findIndex(
      (r) => r.id === "totalEntradaNaoOperacional",
    );
    const inRowIndex = rows.findIndex(
      (r) => r.type === "non-operational-in-cost",
    );
    assert.equal(inRowIndex, inTotalIndex + 1);
  });
});

describe("filterRowsByVisibility", () => {
  const rows = buildDreTableRows(
    [],
    [],
    investmentItems,
    nonOperationalOutItems,
    nonOperationalInItems,
    true,
  );

  it("keeps everything visible by default", () => {
    const filtered = filterRowsByVisibility(rows, {
      showInvestments: true,
      showNonOperationalOut: true,
      showNonOperationalIn: true,
    });
    assert.equal(filtered.length, rows.length);
  });

  it("hides Investimentos and the redundant 'antes dos investimentos' row", () => {
    const filtered = filterRowsByVisibility(rows, {
      showInvestments: false,
      showNonOperationalOut: true,
      showNonOperationalIn: true,
    });
    assert.ok(!filtered.some((r) => r.type === "investment-cost"));
    assert.ok(!filtered.some((r) => r.id === "totalInvestimento"));
    assert.ok(
      !filtered.some((r) => r.id === "lucroOperacionalAntesInvestimentos"),
    );
    assert.ok(filtered.some((r) => r.id === "lucroOperacional"));
  });

  it("hides Resultado Líquido only when BOTH non-operational categories are hidden", () => {
    const onlyOutHidden = filterRowsByVisibility(rows, {
      showInvestments: true,
      showNonOperationalOut: false,
      showNonOperationalIn: true,
    });
    assert.ok(onlyOutHidden.some((r) => r.id === "resultadoLiquido"));
    assert.ok(!onlyOutHidden.some((r) => r.type === "non-operational-out-cost"));

    const bothHidden = filterRowsByVisibility(rows, {
      showInvestments: true,
      showNonOperationalOut: false,
      showNonOperationalIn: false,
    });
    assert.ok(!bothHidden.some((r) => r.id === "resultadoLiquido"));
  });
});

describe("rowBackgroundClass / rowLabelClass", () => {
  it("uses a light muted band for entrada-total/resultado rows", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "totalEntrada")!;
    assert.match(rowBackgroundClass(row), /muted/);
    assert.doesNotMatch(rowBackgroundClass(row), /slate-900|text-white/);
  });

  it("uses a lighter muted band for custo-total rows", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "totalCustoOperacional")!;
    assert.match(rowBackgroundClass(row), /muted/);
    assert.doesNotMatch(rowBackgroundClass(row), /zinc-800/);
  });

  it("uses semibold foreground label for resultado rows", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "lucroOperacional")!;
    assert.match(rowLabelClass(row), /font-semibold/);
    assert.doesNotMatch(rowLabelClass(row), /text-white/);
  });

  it("uses semibold foreground label for total rows", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "totalEntrada")!;
    assert.match(rowLabelClass(row), /font-semibold/);
  });

  it("uses normal (non-uppercase) label class for detail rows", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "revenueMl")!;
    assert.match(rowLabelClass(row), /font-normal/);
    assert.doesNotMatch(rowLabelClass(row), /uppercase/);
  });
});

describe("valueToneClass", () => {
  it("returns muted tone for null/undefined", () => {
    assert.match(valueToneClass(null), /muted/);
    assert.match(valueToneClass(undefined), /muted/);
  });

  it("returns emerald tone for positive values", () => {
    assert.match(valueToneClass(10), /emerald/);
  });

  it("returns rose tone for negative values", () => {
    assert.match(valueToneClass(-10), /rose/);
  });

  it("returns muted tone for exactly zero", () => {
    assert.match(valueToneClass(0), /muted/);
  });
});

function month(overrides: Partial<DreMonthView> = {}): DreMonthView {
  return {
    fixedCostValues: {},
    operationalCostValues: {},
    investmentCostValues: {},
    totals: null,
    lines: null,
    adsCost: null,
    ...overrides,
  } as unknown as DreMonthView;
}

describe("getCellValue", () => {
  it("negates a fixed-cost value (cost shown as negative)", () => {
    const row = { type: "fixed-cost", costItemId: "c1" } as DreTableRow;
    const result = getCellValue(row, month({ fixedCostValues: { c1: 100 } }));
    assert.equal(result.amount, -100);
  });

  it("returns null amount for a fixed-cost item with no recorded value", () => {
    const row = { type: "fixed-cost", costItemId: "missing" } as DreTableRow;
    const result = getCellValue(row, month({ fixedCostValues: {} }));
    assert.equal(result.amount, null);
  });

  it("negates an operational-cost value", () => {
    const row = { type: "operational-cost", costItemId: "o1" } as DreTableRow;
    const result = getCellValue(row, month({ operationalCostValues: { o1: 50 } }));
    assert.equal(result.amount, -50);
  });

  it("negates an investment-cost value", () => {
    const row = { type: "investment-cost", costItemId: "i1" } as DreTableRow;
    const result = getCellValue(row, month({ investmentCostValues: { i1: 75 } }));
    assert.equal(result.amount, -75);
  });

  it("reads totalEntrada from month.totals", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "totalEntrada")!;
    const result = getCellValue(row, month({ totals: { totalEntrada: 1000 } as never }));
    assert.equal(result.amount, 1000);
  });

  it("reads margemContribuicao amount and percent together", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "margemContribuicao")!;
    const result = getCellValue(
      row,
      month({
        totals: { margemContribuicao: 300, margemContribuicaoPercent: 30 } as never,
      }),
    );
    assert.equal(result.amount, 300);
    assert.equal(result.percent, 30);
  });

  it("negates and clamps adsCost to non-negative before negating", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "adsCost")!;
    const result = getCellValue(row, month({ adsCost: 20 }));
    assert.equal(result.amount, -20);
  });

  it("reads lucroOperacionalAntesInvestimentos amount and percent", () => {
    const row = DRE_STATIC_ROWS.find(
      (r) => r.id === "lucroOperacionalAntesInvestimentos",
    )!;
    const result = getCellValue(
      row,
      month({
        totals: {
          lucroOperacionalAntesInvestimentos: 700,
          lucroOperacionalAntesInvestimentosPercent: 70,
        } as never,
      }),
    );
    assert.equal(result.amount, 700);
    assert.equal(result.percent, 70);
  });

  it("reads totalInvestimento amount", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "totalInvestimento")!;
    const result = getCellValue(
      row,
      month({ totals: { totalInvestimento: -50 } as never }),
    );
    assert.equal(result.amount, -50);
  });

  it("reads lucroOperacional amount and percent", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "lucroOperacional")!;
    const result = getCellValue(
      row,
      month({
        totals: {
          lucroOperacional: 650,
          lucroOperacionalPercent: 65,
        } as never,
      }),
    );
    assert.equal(result.amount, 650);
    assert.equal(result.percent, 65);
  });

  it("reads a static row's raw lineKey value from month.lines", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "revenueMl")!;
    const result = getCellValue(row, month({ lines: { revenueMl: 500 } as never }));
    assert.equal(result.amount, 500);
  });

  it("returns nulls when totals/lines are absent", () => {
    const row = DRE_STATIC_ROWS.find((r) => r.id === "totalEntrada")!;
    const result = getCellValue(row, month());
    assert.deepEqual(result, { amount: null, percent: null });
  });
});

describe("isDetailRow", () => {
  it("is true for fixed-cost, operational-cost and investment-cost rows", () => {
    assert.equal(isDetailRow({ type: "fixed-cost" } as DreTableRow), true);
    assert.equal(isDetailRow({ type: "operational-cost" } as DreTableRow), true);
    assert.equal(isDetailRow({ type: "investment-cost" } as DreTableRow), true);
  });

  it("reflects the static row's indent flag", () => {
    const indented = DRE_STATIC_ROWS.find((r) => r.id === "revenueMl")!;
    const notIndented = DRE_STATIC_ROWS.find((r) => r.id === "totalEntrada")!;
    assert.equal(isDetailRow(indented), true);
    assert.equal(isDetailRow(notIndented), false);
  });
});

describe("dreMonthHeaderColorClass / dreMonthShortLabel", () => {
  it("returns a color class for valid months 1-12", () => {
    assert.match(dreMonthHeaderColorClass(1), /bg-sky/);
    assert.match(dreMonthHeaderColorClass(12), /bg-cyan/);
  });

  it("falls back to a muted class for out-of-range months", () => {
    assert.match(dreMonthHeaderColorClass(0), /muted/);
    assert.match(dreMonthHeaderColorClass(13), /muted/);
  });

  it("returns the 3-letter pt-BR label for valid months", () => {
    assert.equal(dreMonthShortLabel(1), "JAN");
    assert.equal(dreMonthShortLabel(12), "DEZ");
  });

  it("falls back to the raw number for out-of-range months", () => {
    assert.equal(dreMonthShortLabel(0), "0");
    assert.equal(dreMonthShortLabel(13), "13");
  });
});
