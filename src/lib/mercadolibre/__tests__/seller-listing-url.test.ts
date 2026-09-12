import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sellerListingModifyUrl } from "../seller-listing-url";

describe("sellerListingModifyUrl", () => {
  it("builds the SYI modify URL for an item id", () => {
    assert.equal(
      sellerListingModifyUrl("MLB4797357610"),
      "https://www.mercadolivre.com.br/syi/core/modify?itemId=MLB4797357610",
    );
  });
});
