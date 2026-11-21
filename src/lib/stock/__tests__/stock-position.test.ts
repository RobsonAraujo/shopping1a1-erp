import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeStockPosition, fullBreakdownOf, type MlPositionInput } from "../stock-position";
import { combineStockItemReads, parseUserProductStock } from "../stock-ml-read";
import { stockChannelLabel, storedChannelFromShipment } from "../stock-channel";

const read = (partial: Partial<MlPositionInput>): MlPositionInput => ({
  depositQty: 20,
  fullAvailableQty: 400,
  fullTransferQty: 17,
  fullOtherQty: 0,
  fullWithdrawalQty: 0,
  fullLostQty: 0,
  fullTotalQty: 417,
  fullUnavailableDetail: null,
  fetchedAt: new Date("2026-11-21T10:00:00Z"),
  error: null,
  ...partial,
});

describe("computeStockPosition", () => {
  it("galpão is Em casa minus depósito; total is Em casa plus everything at ML", () => {
    const pos = computeStockPosition({ ownQty: 120, ml: read({}), hasFull: true });
    assert.equal(pos.warehouse, 100);
    assert.equal(pos.deposit, 20);
    assert.equal(pos.fullUnavailable, 17);
    assert.equal(pos.total, 537);
    assert.deepEqual(pos.alerts, []);
  });

  it("flags when ML lists more in the depósito than exists at home", () => {
    const pos = computeStockPosition({ ownQty: 10, ml: read({ depositQty: 25 }), hasFull: true });
    assert.equal(pos.warehouse, -15);
    assert.deepEqual(pos.alerts, ["deposit_exceeds_own"]);
  });

  it("never turns a failed ML read into zero", () => {
    const pos = computeStockPosition({ ownQty: 10, ml: read({ error: "429" }), hasFull: true });
    assert.equal(pos.deposit, null);
    assert.equal(pos.fullTotal, null);
    assert.equal(pos.total, null);
    assert.ok(pos.alerts.includes("ml_unread"));
  });

  it("item without Full has Full total zero even before the first read", () => {
    const pos = computeStockPosition({ ownQty: 5, ml: null, hasFull: false });
    assert.equal(pos.fullTotal, 0);
    assert.equal(pos.total, 5);
  });

  it("negative Em casa is an alert", () => {
    const pos = computeStockPosition({ ownQty: -2, ml: read({ depositQty: 0 }), hasFull: false });
    assert.ok(pos.alerts.includes("negative_own"));
  });
});

describe("stock ML reads", () => {
  it("parses seller_warehouse as depósito and meli_facility as Full", () => {
    const parsed = parseUserProductStock({
      id: "MLBU800377231",
      locations: [
        { type: "seller_warehouse", store_id: "81328267", quantity: 197, network_node_id: "BRP17013423321" },
        { type: "meli_facility", availability_type: "in_stock", quantity: 409 },
      ],
    });
    assert.deepEqual(parsed, {
      depositQty: 197,
      fullAvailableQty: 409,
      sellerNodeIds: ["BRP17013423321"],
    });
  });

  it("combines UP and fulfillment reads; Full total includes transfer", () => {
    const combined = combineStockItemReads({
      userProducts: [{ depositQty: 197, fullAvailableQty: 409, sellerNodeIds: ["N1"] }],
      fulfillment: [
        { available: 409, inTransfer: 17, withdrawal: 0, lost: 0, other: 0, custody: 426, detail: [{ status: "transfer", quantity: 17 }] },
      ],
      hasFull: true,
    });
    assert.equal(combined.depositQty, 197);
    assert.equal(combined.fullTotalQty, 426);
    assert.equal(combined.fullTransferQty, 17);
    assert.deepEqual(combined.fullUnavailableDetail, [{ status: "transfer", quantity: 17 }]);
  });

  it("sums the status breakdown across Full inventories", () => {
    const combined = combineStockItemReads({
      userProducts: [{ depositQty: 0, fullAvailableQty: 10, sellerNodeIds: [] }],
      fulfillment: [
        { available: 5, inTransfer: 2, withdrawal: 0, lost: 0, other: 1, custody: 8, detail: [{ status: "transfer", quantity: 2 }, { status: "noFiscalCoverage", quantity: 1 }] },
        { available: 5, inTransfer: 3, withdrawal: 0, lost: 1, other: 0, custody: 8, detail: [{ status: "transfer", quantity: 3 }, { status: "lost", quantity: 1 }] },
      ],
      hasFull: true,
    });
    assert.deepEqual(combined.fullUnavailableDetail, [
      { status: "transfer", quantity: 5 },
      { status: "noFiscalCoverage", quantity: 1 },
      { status: "lost", quantity: 1 },
    ]);
  });

  it("item without Full inventory: Full is zero", () => {
    const combined = combineStockItemReads({
      userProducts: [{ depositQty: 16, fullAvailableQty: null, sellerNodeIds: [] }],
      fulfillment: [],
      hasFull: false,
    });
    assert.equal(combined.fullTotalQty, 0);
    assert.equal(combined.depositQty, 16);
  });
});

describe("fullBreakdownOf", () => {
  it("uses the exact ML statuses when the reading has them", () => {
    const detail = [
      { status: "transfer", quantity: 19 },
      { status: "noFiscalCoverage", quantity: 9 },
    ];
    assert.deepEqual(fullBreakdownOf(read({ fullUnavailableDetail: detail })), detail);
    assert.deepEqual(
      computeStockPosition({ ownQty: 0, ml: read({ fullUnavailableDetail: detail }), hasFull: true }).fullBreakdown,
      detail,
    );
  });

  it("older readings fall back to the grouped columns (other = other minus withdrawal)", () => {
    // MLB4931680655 antes da coluna nova: transfer 19, other 25 (= retirada 16 + 9), perdidas 6.
    const parts = fullBreakdownOf(
      read({ fullTransferQty: 19, fullOtherQty: 25, fullWithdrawalQty: 16, fullLostQty: 6, fullUnavailableDetail: null }),
    );
    assert.deepEqual(parts, [
      { status: "transfer", quantity: 19 },
      { status: "withdrawal", quantity: 16 },
      { status: "other", quantity: 9 },
      { status: "lost", quantity: 6 },
    ]);
  });
});

describe("stock channel", () => {
  it("labels channels from the stored logistic type", () => {
    assert.equal(stockChannelLabel("fulfillment"), "Full");
    assert.equal(stockChannelLabel("self_service"), "Flex");
    assert.equal(stockChannelLabel("xd_drop_off"), "Agência");
    assert.equal(stockChannelLabel(storedChannelFromShipment("cross_docking", ["proximity"])), "Envios Agora");
    assert.equal(stockChannelLabel("cross_docking"), "Coleta");
    assert.equal(stockChannelLabel("custom"), "Envio próprio");
    assert.equal(stockChannelLabel(null), null);
  });
});
