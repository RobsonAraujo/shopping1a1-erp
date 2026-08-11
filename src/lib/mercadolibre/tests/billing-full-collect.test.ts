import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractFullCollectChargesFromFullDetails,
  extractFullCollectChargesFromMlDetails,
  extractFullCollectChargesFromSummary,
  groupFullDetailsIntoInboundShipments,
} from "../billing-full-collect";

describe("extractFullCollectChargesFromMlDetails", () => {
  it("extracts CFCBI coleta Full lines with detail id and cost", () => {
    const charges = extractFullCollectChargesFromMlDetails([
      {
        charge_info: {
          detail_amount: 775.62,
          detail_type: "CHARGE",
          detail_sub_type: "CFCBI",
          transaction_detail: "Custo do serviço de coleta Full",
          detail_id: 991122,
          detail_date: "2026-06-20T00:00:00.000Z",
        },
      },
    ]);

    assert.equal(charges.length, 1);
    assert.equal(charges[0]?.detailId, "991122");
    assert.equal(charges[0]?.totalCost, 775.62);
    assert.equal(charges[0]?.source, "ml_details");
  });
});

describe("extractFullCollectChargesFromFullDetails", () => {
  it("extracts INBOUND_COLLECT rows from group/ML/full/details", () => {
    const charges = extractFullCollectChargesFromFullDetails([
      {
        charge_info: {
          detail_amount: 600,
          detail_type: "CHARGE",
          transaction_detail: "Custo do serviço de coleta Full",
          detail_id: 445566,
          detail_date: "2026-06-20T00:00:00.000Z",
        },
        fulfillment_info: { type: "INBOUND_COLLECT" },
      },
    ]);

    assert.equal(charges.length, 1);
    assert.equal(charges[0]?.detailId, "445566");
    assert.equal(charges[0]?.totalCost, 600);
    assert.equal(charges[0]?.source, "full_details");
  });
});

describe("groupFullDetailsIntoInboundShipments", () => {
  it("groups inbound collect lines by inbound_id with units and products", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      charge_info: {
        detail_amount: 10 + index,
        detail_type: "CHARGE",
        detail_sub_type: "CFCBI",
        transaction_detail: "Custo do serviço de coleta Full",
        detail_id: 1_000_000 + index,
        creation_date_time: "2026-06-19T14:30:00",
      },
      fulfillment_info: {
        type: "INBOUND_COLLECT",
        inbound_id: 69719031,
        quantity: index === 11 ? 20 : 27,
        sku: `SKU-${index + 1}`,
        inventory_id: `INV-${index + 1}`,
      },
    }));

    const shipments = groupFullDetailsIntoInboundShipments(rows);
    assert.equal(shipments.length, 1);

    const shipment = shipments[0];
    assert.equal(shipment?.inboundId, "69719031");
    assert.equal(shipment?.productCount, 12);
    assert.equal(shipment?.totalUnits, 317);
    assert.equal(shipment?.totalCost, 186);
    assert.equal(shipment?.shippedAt, new Date("2026-06-19T14:30:00").toISOString());
    assert.equal(shipment?.unassigned, false);
    assert.equal(shipment?.chargeDetailIds.length, 12);
  });

  it("excludes WITHDRAWAL rows from inbound grouping", () => {
    const shipments = groupFullDetailsIntoInboundShipments([
      {
        charge_info: {
          detail_amount: 50,
          detail_type: "CHARGE",
          detail_sub_type: "CFCB",
          transaction_detail: "Cargo por retirada Full",
          detail_id: 1,
        },
        fulfillment_info: {
          type: "WITHDRAWAL",
          inbound_id: 999,
          quantity: 5,
          sku: "SKU-A",
        },
      },
      {
        charge_info: {
          detail_amount: 30,
          detail_type: "CHARGE",
          detail_sub_type: "CFCBI",
          transaction_detail: "Custo do serviço de coleta Full",
          detail_id: 2,
          creation_date_time: "2026-06-10T10:00:00",
        },
        fulfillment_info: {
          type: "INBOUND_COLLECT",
          inbound_id: 888,
          quantity: 3,
          sku: "SKU-B",
        },
      },
    ]);

    assert.equal(shipments.length, 1);
    assert.equal(shipments[0]?.inboundId, "888");
    assert.equal(shipments[0]?.totalUnits, 3);
  });

  it("creates unassigned bucket when inbound_id is missing", () => {
    const shipments = groupFullDetailsIntoInboundShipments([
      {
        charge_info: {
          detail_amount: 12.5,
          detail_type: "CHARGE",
          detail_sub_type: "CFCBI",
          transaction_detail: "Custo do serviço de coleta Full",
          detail_id: 555,
        },
        fulfillment_info: {
          type: "INBOUND_COLLECT",
          quantity: 2,
          sku: "SKU-X",
        },
      },
    ]);

    assert.equal(shipments.length, 1);
    assert.equal(shipments[0]?.inboundId, "unassigned-555");
    assert.equal(shipments[0]?.unassigned, true);
  });

  it("defaults an unrecognized sub_type/label to fullShipping instead of dropping the row (regression: was excluding real collect charges)", () => {
    const shipments = groupFullDetailsIntoInboundShipments([
      {
        charge_info: {
          detail_amount: 600,
          detail_type: "CHARGE",
          detail_sub_type: "UNKNOWN",
          transaction_detail: "Full",
          detail_id: 1,
          creation_date_time: "2026-07-20T10:00:00",
        },
        fulfillment_info: {
          inbound_id: 71750136,
          quantity: 50,
          sku: "SKU-A",
        },
      },
    ]);

    assert.equal(shipments.length, 1);
    assert.equal(shipments[0]?.inboundId, "71750136");
    assert.equal(shipments[0]?.totalCost, 600);
    assert.equal(shipments[0]?.nonComplianceCost, 0);
    assert.equal(shipments[0]?.totalUnits, 50);
  });

  it("sums an INBOUND_PENALTY charge into the same envio's totalCost and tracks it as nonComplianceCost", () => {
    const shipments = groupFullDetailsIntoInboundShipments([
      {
        charge_info: {
          detail_amount: 600,
          detail_type: "CHARGE",
          detail_sub_type: "CFCBI",
          transaction_detail: "Custo do serviço de coleta Full",
          detail_id: 1,
          creation_date_time: "2026-07-20T10:00:00",
        },
        fulfillment_info: {
          type: "INBOUND_COLLECT",
          inbound_id: 71750136,
          quantity: 50,
          sku: "SKU-A",
        },
      },
      {
        charge_info: {
          detail_amount: 129,
          detail_type: "CHARGE",
          detail_sub_type: "CFPB",
          transaction_detail: "Full",
          detail_id: 2,
          creation_date_time: "2026-07-20T10:05:00",
        },
        fulfillment_info: {
          type: "INBOUND_PENALTY",
          inbound_id: 71750136,
        },
      },
    ]);

    assert.equal(shipments.length, 1);
    assert.equal(shipments[0]?.inboundId, "71750136");
    assert.equal(shipments[0]?.totalCost, 729);
    assert.equal(shipments[0]?.nonComplianceCost, 129);
    assert.equal(shipments[0]?.totalUnits, 50);
  });

  it("does not double-count duplicate detail_id rows", () => {
    const row = {
      charge_info: {
        detail_amount: 10,
        detail_type: "CHARGE",
        detail_sub_type: "CFCBI",
        transaction_detail: "Custo do serviço de coleta Full",
        detail_id: 999001,
        creation_date_time: "2026-06-11T10:00:00",
      },
      fulfillment_info: {
        type: "INBOUND_COLLECT",
        inbound_id: 69526222,
        quantity: 123,
        sku: "SKU-A",
      },
    };

    const shipments = groupFullDetailsIntoInboundShipments([row, row]);
    assert.equal(shipments.length, 1);
    assert.equal(shipments[0]?.totalUnits, 123);
    assert.equal(shipments[0]?.totalCost, 10);
  });
});

describe("extractFullCollectChargesFromSummary", () => {
  it("extracts full shipping summary charges as fallback", () => {
    const charges = extractFullCollectChargesFromSummary([
      {
        type: "INBOUND_COLLECT",
        label: "Custo do serviço de coleta Full",
        amount: 2805.25,
      },
    ]);

    assert.equal(charges.length, 1);
    assert.equal(charges[0]?.totalCost, 2805.25);
    assert.equal(charges[0]?.source, "summary");
  });
});
