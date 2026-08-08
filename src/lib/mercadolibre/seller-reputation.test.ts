import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSellerReputationBadge } from "@/lib/mercadolibre/seller-reputation";

describe("buildSellerReputationBadge", () => {
  it("returns null when there is no reputation data", () => {
    assert.equal(buildSellerReputationBadge(null), null);
    assert.equal(buildSellerReputationBadge(undefined), null);
    assert.equal(
      buildSellerReputationBadge({ level_id: null, power_seller_status: null }),
      null,
    );
  });

  it("prioritizes MercadoLíder power seller status over the level color", () => {
    const badge = buildSellerReputationBadge({
      level_id: "5_green",
      power_seller_status: "platinum",
    });
    assert.deepEqual(badge, {
      label: "MercadoLíder Platinum",
      variant: "success",
    });
  });

  it("falls back to level color when there is no power seller status", () => {
    assert.deepEqual(
      buildSellerReputationBadge({ level_id: "5_green", power_seller_status: null }),
      { label: "Reputação verde", variant: "success" },
    );
    assert.deepEqual(
      buildSellerReputationBadge({ level_id: "3_yellow", power_seller_status: null }),
      { label: "Reputação amarela", variant: "warning" },
    );
    assert.deepEqual(
      buildSellerReputationBadge({ level_id: "1_red", power_seller_status: null }),
      { label: "Reputação vermelha", variant: "destructive" },
    );
  });

  it("returns null for an unrecognized level_id with no power seller status", () => {
    assert.equal(
      buildSellerReputationBadge({ level_id: "unknown", power_seller_status: null }),
      null,
    );
  });
});
