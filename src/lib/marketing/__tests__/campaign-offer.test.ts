import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BETA_OFFER,
  daysLeftInOffer,
  daysLeftLabel,
  isOfferActive,
  offerDeadlineLabel,
  offerTrialEndsAt,
} from "../campaign-offer";

describe("campaign offer (/beta)", () => {
  it("is active up to the last second of 30/11 in Brasília and off right after", () => {
    assert.equal(isOfferActive(new Date("2026-11-16T12:00:00-03:00")), true);
    assert.equal(isOfferActive(new Date("2026-11-30T23:59:59-03:00")), true);
    assert.equal(isOfferActive(new Date("2026-12-01T00:00:00-03:00")), false);
  });

  it("counts calendar days left in Brasília, including today", () => {
    assert.equal(daysLeftInOffer(new Date("2026-11-16T09:00:00-03:00")), 15);
    assert.equal(daysLeftInOffer(new Date("2026-11-29T23:59:59-03:00")), 2);
    assert.equal(daysLeftInOffer(new Date("2026-11-30T00:00:01-03:00")), 1);
    // 01:00 UTC do dia 01/12 ainda é 30/11 em Brasília.
    assert.equal(daysLeftInOffer(new Date("2026-12-01T01:00:00.000Z")), 1);
    assert.equal(daysLeftInOffer(new Date("2026-12-02T10:00:00-03:00")), 0);
  });

  it("says 'último dia' on the deadline day", () => {
    assert.equal(daysLeftLabel(15), "faltam 15 dias");
    assert.equal(daysLeftLabel(2), "faltam 2 dias");
    assert.equal(daysLeftLabel(1), "último dia");
  });

  it("guarantees 30 days from the signup moment", () => {
    const createdAt = new Date("2026-11-20T15:00:00.000Z");
    const ends = offerTrialEndsAt(createdAt);
    assert.equal(
      ends.getTime() - createdAt.getTime(),
      BETA_OFFER.trialDays * 86_400_000,
    );
  });

  it("labels the deadline as dd/mm in Brasília", () => {
    assert.equal(offerDeadlineLabel(), "30/11");
  });
});
