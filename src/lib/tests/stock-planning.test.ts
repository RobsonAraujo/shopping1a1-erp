import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeStockPlanningDisplay } from "../stock-planning";
import { stockPlanningConfig } from "@/config/stock-planning";

const NOW = new Date("2026-06-15T12:00:00");

describe("computeStockPlanningDisplay", () => {
  it("returns 'Sem vendas no período' when there were no sales in the window", () => {
    const result = computeStockPlanningDisplay(50, 0, 14, stockPlanningConfig, 0, NOW);
    assert.equal(result.stockWillLast, "Sem vendas no período");
    assert.equal(result.searchStartsOn, null);
    assert.equal(result.needsPurchaseAttention, false);
  });

  it("returns '—' when windowDays is 0 even with a positive quantity", () => {
    const result = computeStockPlanningDisplay(50, 10, 0, stockPlanningConfig, 0, NOW);
    assert.equal(result.stockWillLast, "—");
  });

  it("treats a non-finite availableQuantity as the empty/no-data branch", () => {
    const result = computeStockPlanningDisplay(
      Number.NaN,
      10,
      14,
      stockPlanningConfig,
      0,
      NOW,
    );
    assert.equal(result.stockWillLast, "—");
  });

  it("shows '< 1 dia' when coverage is under a day", () => {
    // 1 unit in stock, selling 14 units over 14 days => 1/day => coverage = 1 day exactly is boundary;
    // use a heavier sales rate to push coverage below 1 day.
    const result = computeStockPlanningDisplay(1, 28, 14, stockPlanningConfig, 0, NOW);
    assert.equal(result.stockWillLast, "< 1 dia");
  });

  it("computes floored day coverage and singular/plural correctly", () => {
    // dailyAvg = 14/14 = 1/day, stock=10 => coverage=10 days
    const result = computeStockPlanningDisplay(10, 14, 14, stockPlanningConfig, 0, NOW);
    assert.equal(result.stockWillLast, "10 dias");

    // stock=1, dailyAvg=1 => coverage=1 day => singular
    const singular = computeStockPlanningDisplay(1, 14, 14, stockPlanningConfig, 0, NOW);
    assert.equal(singular.stockWillLast, "1 dia");
  });

  it("flags needsSchedulingAttention/needsPurchaseAttention when the trigger date is today or past", () => {
    // dailyAvg=1/day, stock=1 => stockout tomorrow-ish; with leadTimeDays=14 the
    // search date is already far in the past relative to stockout => overdue.
    const result = computeStockPlanningDisplay(1, 14, 14, stockPlanningConfig, 0, NOW);
    assert.equal(result.searchIsOverdue, true);
    assert.equal(result.needsSchedulingAttention, true);
    assert.equal(result.purchaseIsOverdue, true);
    assert.equal(result.needsPurchaseAttention, true);
  });

  it("does not flag attention when stock coverage comfortably exceeds lead times", () => {
    // dailyAvg = 14/14 = 1/day, stock=1000 => coverage ~1000 days, way past lead times.
    const result = computeStockPlanningDisplay(1000, 14, 14, stockPlanningConfig, 0, NOW);
    assert.equal(result.searchIsOverdue, false);
    assert.equal(result.needsSchedulingAttention, false);
    assert.equal(result.purchaseIsOverdue, false);
    assert.equal(result.needsPurchaseAttention, false);
  });

  it("adds purchaseLeadTimeDays on top of the config lead time for the purchase date", () => {
    const withoutExtraLead = computeStockPlanningDisplay(
      100,
      14,
      14,
      stockPlanningConfig,
      0,
      NOW,
    );
    const withExtraLead = computeStockPlanningDisplay(
      100,
      14,
      14,
      stockPlanningConfig,
      10,
      NOW,
    );
    assert.ok(
      (withExtraLead.purchaseStartsAtMs ?? 0) <
        (withoutExtraLead.purchaseStartsAtMs ?? 0),
      "adding purchase lead time should push the suggested purchase date earlier",
    );
  });

  it("clamps a negative purchaseLeadTimeDays to 0", () => {
    const negative = computeStockPlanningDisplay(100, 14, 14, stockPlanningConfig, -5, NOW);
    const zero = computeStockPlanningDisplay(100, 14, 14, stockPlanningConfig, 0, NOW);
    assert.equal(negative.purchaseStartsAtMs, zero.purchaseStartsAtMs);
  });

  it("includes the sales-window hint text matching the configured date field", () => {
    const result = computeStockPlanningDisplay(0, 0, 14, stockPlanningConfig, 0, NOW);
    assert.match(result.tooltips.stockWillLast, /fechamento do pedido/);
  });
});
