import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeBillingLabel,
  isFullChargeLabel,
  classifyFullChargeLabel,
  subtractBillingCost,
  addBillingBonus,
  billingPeriodKey,
  billingApiUrl,
  classifyMlBillingEntry,
  applyBillingLineAmount,
} from "../billing-shared";

describe("normalizeBillingLabel", () => {
  it("lowercases and strips accents", () => {
    assert.equal(normalizeBillingLabel("Tarifa de Envío"), "tarifa de envio");
    assert.equal(normalizeBillingLabel("Comissão"), "comissao");
  });

  it("handles undefined as empty string", () => {
    assert.equal(normalizeBillingLabel(undefined), "");
  });
});

describe("isFullChargeLabel / classifyFullChargeLabel", () => {
  // These functions receive labels already lowercased/de-accented by
  // normalizeBillingLabel() upstream (see billing-details.ts) — the regexes
  // have no "i" flag, so tests must pass already-normalized text too.
  it("detects 'full' and 'fulfillment' labels", () => {
    assert.equal(isFullChargeLabel("armazenagem full"), true);
    assert.equal(isFullChargeLabel("fulfillment storage"), true);
    assert.equal(isFullChargeLabel("tarifa de venda"), false);
  });

  it("classifies storage charges", () => {
    assert.equal(classifyFullChargeLabel("full - armazenagem"), "fullStorage");
    assert.equal(classifyFullChargeLabel("full storage warehouse"), "fullStorage");
  });

  it("classifies non-compliance charges", () => {
    assert.equal(
      classifyFullChargeLabel("full - multa por inconformidade"),
      "fullNonCompliance",
    );
  });

  it("classifies shipping charges explicitly", () => {
    assert.equal(classifyFullChargeLabel("full - envio ao cliente"), "fullShipping");
    assert.equal(classifyFullChargeLabel("full - coleta"), "fullShipping");
  });

  it("returns null for full-labeled charges without a specific keyword (let the caller fall back to detail_sub_type/fulfillment_info.type)", () => {
    assert.equal(classifyFullChargeLabel("full - outro"), null);
  });

  it("returns null for non-full labels", () => {
    assert.equal(classifyFullChargeLabel("tarifa de venda"), null);
  });
});

describe("subtractBillingCost / addBillingBonus", () => {
  it("subtracts the absolute value of a negative amount", () => {
    assert.equal(subtractBillingCost(100, -10), 90);
    assert.equal(subtractBillingCost(100, 10), 90);
  });

  it("adds the absolute value of the amount", () => {
    assert.equal(addBillingBonus(100, -10), 110);
    assert.equal(addBillingBonus(100, 10), 110);
  });
});

describe("billingPeriodKey", () => {
  it("formats year/month as YYYY-MM-01", () => {
    assert.equal(billingPeriodKey(2026, 1), "2026-01-01");
    assert.equal(billingPeriodKey(2026, 12), "2026-12-01");
  });
});

describe("billingApiUrl", () => {
  it("prefixes the path with a leading slash if missing", () => {
    const url = billingApiUrl("billing/x");
    assert.match(url, /\/billing\/x$/);
  });

  it("does not duplicate the leading slash", () => {
    const url = billingApiUrl("/billing/x");
    assert.ok(!url.includes("//billing"));
  });
});

describe("classifyMlBillingEntry", () => {
  it("classifies PADS as ads", () => {
    assert.equal(classifyMlBillingEntry("PADS", "", ""), "ads");
  });

  it("classifies cancelled sales by subType or label", () => {
    assert.equal(classifyMlBillingEntry("CXC", "", ""), "cancelled");
    assert.equal(classifyMlBillingEntry("XYZ", "venda cancelada", ""), "cancelled");
  });

  it("classifies sale fee by subType prefix", () => {
    assert.equal(classifyMlBillingEntry("CV1", "", ""), "saleFee");
    assert.equal(classifyMlBillingEntry("COM", "", ""), "saleFee");
  });

  it("classifies sale fee by label when not a bonus", () => {
    assert.equal(
      classifyMlBillingEntry("XYZ", "tarifa de venda", "CHARGE"),
      "saleFee",
    );
  });

  it("a bonus-typed label without any recognized keyword stays unmapped", () => {
    // isBonus=true skips the plain label->saleFee branch (which requires !isBonus);
    // "comissao" alone doesn't match the bonus-branch keywords either.
    const result = classifyMlBillingEntry("XYZ", "comissao", "BONUS");
    assert.equal(result, "unmapped");
  });

  it("classifies seller shipping by subType", () => {
    assert.equal(classifyMlBillingEntry("SHP", "", ""), "sellerShipping");
    assert.equal(classifyMlBillingEntry("CFFE", "", ""), "sellerShipping");
  });

  it("classifies full-related subtypes", () => {
    assert.equal(classifyMlBillingEntry("CFCBI", "", ""), "fullShipping");
    assert.equal(classifyMlBillingEntry("CFWA", "", ""), "fullStorage");
    assert.equal(classifyMlBillingEntry("CFPB", "", ""), "fullNonCompliance");
  });

  it("prefers detail_sub_type over a generic 'full' label for non-compliance charges (regression: label used to default to fullShipping and mask CFPB)", () => {
    assert.equal(
      classifyMlBillingEntry("CFPB", "full - outro", ""),
      "fullNonCompliance",
    );
  });

  it("classifies bonus refunds as partialReturn by default", () => {
    assert.equal(
      classifyMlBillingEntry("BXD", "devolução parcial", "BONUS"),
      "partialReturn",
    );
  });

  it("classifies bonus shipping refunds as sellerShipping", () => {
    assert.equal(
      classifyMlBillingEntry("BFFE", "estorno de frete", "BONUS"),
      "sellerShipping",
    );
  });

  it("classifies bonus sale-fee refunds (BV*) as saleFee", () => {
    assert.equal(
      classifyMlBillingEntry("BVML", "estorno de tarifa", "BONUS"),
      "saleFee",
    );
  });

  it("classifies generic refund labels as partialReturn", () => {
    assert.equal(classifyMlBillingEntry("XYZ", "reembolso parcial", ""), "partialReturn");
  });

  it("skips known no-op subtypes", () => {
    assert.equal(classifyMlBillingEntry("CFONPN", "", ""), "skip");
    assert.equal(classifyMlBillingEntry("CESM", "", ""), "skip");
  });

  it("returns unmapped for unknown entries", () => {
    assert.equal(classifyMlBillingEntry("ZZZ999", "coisa aleatória", ""), "unmapped");
  });
});

describe("applyBillingLineAmount", () => {
  it("always adds for partialReturn regardless of bonus flag", () => {
    assert.equal(applyBillingLineAmount("partialReturn", 100, -20, false), 120);
  });

  it("subtracts a regular saleFee charge", () => {
    assert.equal(applyBillingLineAmount("saleFee", 100, 10, false), 90);
  });

  it("adds a bonus saleFee credit", () => {
    assert.equal(applyBillingLineAmount("saleFee", 100, 10, true), 110);
  });

  it("subtracts a regular fullStorage charge", () => {
    assert.equal(applyBillingLineAmount("fullStorage", 100, 15, false), 85);
  });

  it("subtracts a regular ads charge like other cost categories", () => {
    assert.equal(applyBillingLineAmount("ads", 100, 10, false), 90);
  });

  it("leaves current unchanged for skip category", () => {
    assert.equal(applyBillingLineAmount("skip", 100, 10, false), 100);
  });
});
