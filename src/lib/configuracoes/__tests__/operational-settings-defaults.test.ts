import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATIONAL_SETTINGS_DEFAULTS,
  toPurchaseAnalysisValues,
  toStockPlanningValues,
  type OperationalSettingsValues,
} from "@/lib/configuracoes/operational-settings-defaults";

function settings(
  overrides: Partial<OperationalSettingsValues> = {},
): OperationalSettingsValues {
  return { ...OPERATIONAL_SETTINGS_DEFAULTS, ...overrides };
}

describe("toStockPlanningValues", () => {
  it("carries the organization's overrides through untouched", () => {
    const result = toStockPlanningValues(
      settings({
        salesAverageWindowDays: 45,
        leadTimeDays: 10,
        activeStockBufferDays: 3,
      }),
    );
    assert.equal(result.salesAverageWindowDays, 45);
    assert.equal(result.leadTimeDays, 10);
    assert.equal(result.activeStockBufferDays, 3);
  });

  it("does not carry purchase-analysis-only fields (targetCoverageBufferDays, rotation)", () => {
    const result = toStockPlanningValues(settings()) as Record<string, unknown>;
    assert.equal("targetCoverageBufferDays" in result, false);
    assert.equal("rotationHighDailyAvg" in result, false);
  });
});

describe("toPurchaseAnalysisValues", () => {
  it("maps rotationHigh/MediumDailyAvg into rotationDailyAvg.altaMin/mediaMin", () => {
    const result = toPurchaseAnalysisValues(
      settings({ rotationHighDailyAvg: 5, rotationMediumDailyAvg: 2 }),
    );
    assert.equal(result.rotationDailyAvg.altaMin, 5);
    assert.equal(result.rotationDailyAvg.mediaMin, 2);
  });

  it("carries targetCoverageBufferDays through untouched", () => {
    const result = toPurchaseAnalysisValues(
      settings({ targetCoverageBufferDays: 14 }),
    );
    assert.equal(result.targetCoverageBufferDays, 14);
  });
});
