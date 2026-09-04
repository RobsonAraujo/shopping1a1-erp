import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMercadoLivreItemMetricsUrl } from "../item-metrics-url";

describe("buildMercadoLivreItemMetricsUrl", () => {
  it("builds the performance metrics URL for an item id", () => {
    const url = buildMercadoLivreItemMetricsUrl("MLB123");
    assert.equal(
      url,
      "https://www.mercadolivre.com.br/metricas/MLB123/performance-item?finish_period_evolutionary=lastPeriod&start_period_evolutionary=lastMonth",
    );
  });
});
