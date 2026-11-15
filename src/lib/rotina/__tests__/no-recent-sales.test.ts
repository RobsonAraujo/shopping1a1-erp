import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysSinceLastSale,
  isNoRecentSales,
} from "@/lib/rotina/no-recent-sales";

const NOW = new Date("2026-11-14T15:00:00.000Z");

function input(
  overrides: Partial<Parameters<typeof isNoRecentSales>[0]> = {},
): Parameters<typeof isNoRecentSales>[0] {
  return {
    mlStatus: "active",
    lastSaleAt: null,
    salesWindowDays: 14,
    listedAt: "2026-10-01T12:00:00.000Z",
    firstSeenAt: "2026-10-01T12:00:00.000Z",
    days: 3,
    now: NOW,
    ...overrides,
  };
}

describe("isNoRecentSales", () => {
  it("entra quando não há venda na janela e N cabe nela", () => {
    assert.equal(isNoRecentSales(input()), true);
  });

  it("entra quando a última venda é mais antiga que N dias", () => {
    assert.equal(
      isNoRecentSales(
        input({ lastSaleAt: "2026-11-10T12:00:00.000Z", days: 3 }),
      ),
      true,
    );
  });

  it("não entra quando vendeu dentro do prazo", () => {
    assert.equal(
      isNoRecentSales(
        input({ lastSaleAt: "2026-11-13T12:00:00.000Z", days: 3 }),
      ),
      false,
    );
  });

  it("não entra se o anúncio é mais novo que N dias", () => {
    assert.equal(
      isNoRecentSales(
        input({
          listedAt: "2026-11-13T12:00:00.000Z",
          firstSeenAt: "2026-11-13T12:00:00.000Z",
          lastSaleAt: null,
          days: 3,
        }),
      ),
      false,
    );
  });

  it("não entra se N é maior que a janela lida", () => {
    assert.equal(
      isNoRecentSales(input({ salesWindowDays: 7, days: 14 })),
      false,
    );
  });

  it("não entra sem leitura de vendas", () => {
    assert.equal(isNoRecentSales(input({ salesWindowDays: null })), false);
  });

  it("não entra se o anúncio não está ativo", () => {
    assert.equal(isNoRecentSales(input({ mlStatus: "paused" })), false);
  });

  it("usa firstSeenAt quando listedAt é nulo", () => {
    assert.equal(
      isNoRecentSales(
        input({
          listedAt: null,
          firstSeenAt: "2026-11-13T12:00:00.000Z",
          lastSaleAt: null,
        }),
      ),
      false,
    );
  });
});

describe("daysSinceLastSale", () => {
  it("conta dias cheios desde a última venda", () => {
    assert.equal(daysSinceLastSale("2026-11-11T15:00:00.000Z", NOW), 3);
  });
});
