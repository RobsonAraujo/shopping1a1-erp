import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysSinceLastSale,
  isNoRecentSales,
  noRecentSalesDayOptions,
  resolveNoRecentSalesDays,
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

describe("noRecentSalesDayOptions", () => {
  it("só mostra prazos que cabem nos dias lidos", () => {
    assert.deepEqual(noRecentSalesDayOptions(14), [2, 3, 7, 14]);
    assert.deepEqual(noRecentSalesDayOptions(30), [2, 3, 7, 14, 30]);
    assert.deepEqual(noRecentSalesDayOptions(10), [2, 3, 7]);
  });

  it("sem leitura, mostra todos", () => {
    assert.deepEqual(noRecentSalesDayOptions(null), [2, 3, 7, 14, 30, 60]);
  });
});

describe("resolveNoRecentSalesDays", () => {
  it("prazo salvo acima dos dias lidos cai no maior que cabe", () => {
    assert.equal(resolveNoRecentSalesDays(30, 14), 14);
    assert.equal(resolveNoRecentSalesDays(60, 30), 30);
    assert.equal(resolveNoRecentSalesDays(14, 10), 7);
  });

  it("mantém o chip que cabe", () => {
    assert.equal(resolveNoRecentSalesDays(7, 14), 7);
    assert.equal(resolveNoRecentSalesDays(30, 30), 30);
    assert.equal(resolveNoRecentSalesDays(30, null), 30);
  });

  it("valor que não é chip volta ao padrão", () => {
    assert.equal(resolveNoRecentSalesDays(5, 14), 3);
    assert.equal(resolveNoRecentSalesDays(1, 14), 3);
    assert.equal(resolveNoRecentSalesDays("30", 14), 3);
    assert.equal(resolveNoRecentSalesDays(null, 14), 3);
  });
});
