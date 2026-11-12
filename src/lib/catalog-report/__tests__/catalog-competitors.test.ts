import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  logisticLabel,
  logisticRank,
  parseCatalogCompetitionSummary,
  summarizeCatalogCompetitors,
} from "@/lib/catalog-report/catalog-competitors";

const FETCHED = new Date("2026-11-12T12:00:00.000Z");

describe("summarizeCatalogCompetitors", () => {
  it("drops own offers and offers without price, sorts by price", () => {
    const summary = summarizeCatalogCompetitors({
      results: [
        { item_id: "MLB-ME", seller_id: 99, price: 40, shipping: { logistic_type: "fulfillment" } },
        { item_id: "MLB-ME2", seller_id: 99, price: 39 },
        { item_id: "MLB-A", seller_id: 1, price: 52, shipping: { logistic_type: "fulfillment", free_shipping: true } },
        { item_id: "MLB-B", seller_id: "2", price: "45,00", shipping: { logistic_type: "self_service" } },
        { item_id: "MLB-C", seller_id: 3, price: null },
        { item_id: "MLB-A", seller_id: 1, price: 52 },
        { seller_id: 4, price: 10 },
      ],
      ownSellerId: 99,
      myItemId: "MLB-ME",
      myLogisticType: "fulfillment",
      fetchedAt: FETCHED,
    });
    assert.equal(summary.competitorCount, 2);
    assert.equal(summary.ownOfferCount, 2);
    assert.deepEqual(
      summary.top.map((offer) => [offer.itemId, offer.price, offer.logisticType]),
      [
        ["MLB-B", 45, "self_service"],
        ["MLB-A", 52, "fulfillment"],
      ],
    );
    assert.equal(summary.top[1].freeShipping, true);
    assert.equal(summary.top[0].freeShipping, null);
    assert.equal(summary.fetchedAt, FETCHED.toISOString());
  });

  it("reads the real /products/{id}/items shape (probe 2026-11-12)", () => {
    // Formato real, IDs trocados: o próprio vendedor aparece duas vezes (o
    // anúncio ganhando e o "irmão"), `price` já tem a promoção, e a ordem do
    // ML não é estritamente por preço (a oferta de 61,90 veio no fim).
    const offer = (
      item_id: string,
      seller_id: number,
      price: number,
      logistic_type: string,
      extra: Record<string, unknown> = {},
    ) => ({
      item_id,
      seller_id,
      price,
      original_price: null,
      currency_id: "BRL",
      condition: "new",
      listing_type_id: "gold_special",
      shipping: { free_shipping: true, mode: "me2", logistic_type, tags: ["mandatory_free_shipping"] },
      deal_ids: [],
      ...extra,
    });
    const summary = summarizeCatalogCompetitors({
      results: [
        offer("MLB-ME", 1701, 158.08, "fulfillment"),
        offer("MLB-IRMAO", 1701, 159.9, "fulfillment"),
        offer("MLB-A", 149, 179.5, "cross_docking", { official_store_id: 67934 }),
        offer("MLB-B", 477, 189, "cross_docking", { original_price: 363.33 }),
        offer("MLB-C", 632, 190.13, "fulfillment"),
        offer("MLB-D", 138, 61.9, "drop_off"),
      ],
      ownSellerId: 1701,
      myItemId: "MLB-ME",
      myLogisticType: "fulfillment",
      fetchedAt: FETCHED,
    });
    assert.equal(summary.competitorCount, 4);
    assert.equal(summary.ownOfferCount, 2);
    assert.deepEqual(summary.ownOther, { itemId: "MLB-IRMAO", price: 159.9, logisticType: "fulfillment" });
    assert.deepEqual(
      summary.top.map((o) => [o.itemId, o.price, o.logisticType]),
      [
        ["MLB-D", 61.9, "drop_off"],
        ["MLB-A", 179.5, "cross_docking"],
        ["MLB-B", 189, "cross_docking"],
        ["MLB-C", 190.13, "fulfillment"],
      ],
    );
  });

  it("round-trips through the stored JSON, and rejects unknown shapes", () => {
    const summary = summarizeCatalogCompetitors({
      results: [{ item_id: "MLB-A", seller_id: 1, price: 50 }],
      ownSellerId: 99,
      myItemId: "MLB-ME",
      myLogisticType: null,
      fetchedAt: FETCHED,
    });
    assert.deepEqual(parseCatalogCompetitionSummary(JSON.parse(JSON.stringify(summary))), summary);
    // Gravado antes de `ownOther` existir: lê como `null`.
    const legacy = JSON.parse(JSON.stringify(summary));
    delete legacy.ownOther;
    assert.equal(parseCatalogCompetitionSummary(legacy)?.ownOther, null);
    assert.equal(parseCatalogCompetitionSummary(null), null);
    assert.equal(parseCatalogCompetitionSummary({ version: 2 }), null);
    assert.equal(parseCatalogCompetitionSummary("x"), null);
  });
});

describe("logistic helpers", () => {
  it("ranks Full above Flex above Coleta above Agência", () => {
    assert.ok(logisticRank("fulfillment") > logisticRank("self_service"));
    assert.ok(logisticRank("self_service") > logisticRank("cross_docking"));
    assert.ok(logisticRank("cross_docking") > logisticRank("drop_off"));
    assert.equal(logisticRank(null), 0);
    assert.equal(logisticLabel("fulfillment"), "Full");
    assert.equal(logisticLabel("whatever"), null);
  });
});
