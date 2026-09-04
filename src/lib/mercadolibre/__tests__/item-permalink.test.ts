import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buyerFacingItemPermalink } from "../item-permalink";

describe("buyerFacingItemPermalink", () => {
  it("removes pdp_filters query param from a valid URL", () => {
    const result = buyerFacingItemPermalink(
      "https://produto.mercadolivre.com.br/MLB-123-foo?pdp_filters=item_id%3AMLB123&other=1",
      "MLB123",
    );
    assert.equal(
      result,
      "https://produto.mercadolivre.com.br/MLB-123-foo?other=1",
    );
  });

  it("leaves URL untouched when there's no pdp_filters param", () => {
    const result = buyerFacingItemPermalink(
      "https://produto.mercadolivre.com.br/MLB-123-foo",
      "MLB123",
    );
    assert.equal(result, "https://produto.mercadolivre.com.br/MLB-123-foo");
  });

  it("falls back to a constructed URL when permalink is invalid", () => {
    const result = buyerFacingItemPermalink("not a url", "MLB123456");
    assert.equal(result, "https://produto.mercadolivre.com.br/mlb-123456");
  });

  it("fallback defaults to mlb site when item id has no site prefix", () => {
    const result = buyerFacingItemPermalink("not a url", "123456");
    assert.equal(result, "https://produto.mercadolivre.com.br/mlb-123456");
  });
});
