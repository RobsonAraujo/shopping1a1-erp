import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFulfillmentRead } from "../stock-ml-read";

describe("parseFulfillmentRead", () => {
  it("splits statuses and keeps lost units out of the custody total", () => {
    // Resposta real (nov/2026), inventário IUJY20175.
    const read = parseFulfillmentRead({
      total: 183,
      available_quantity: 132,
      not_available_detail: [
        { status: "noFiscalCoverage", quantity: 9 },
        { status: "transfer", quantity: 20 },
        { status: "lost", quantity: 6 },
        { status: "withdrawal", quantity: 16 },
      ],
    });
    assert.deepEqual(read, {
      available: 132,
      inTransfer: 20,
      withdrawal: 16,
      lost: 6,
      other: 9,
      custody: 177,
    });
  });
});
