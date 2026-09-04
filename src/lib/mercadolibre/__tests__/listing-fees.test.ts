import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siteIdFromItemId } from "../listing-fees";

describe("siteIdFromItemId", () => {
  it("extracts the 3-letter site prefix", () => {
    assert.equal(siteIdFromItemId("MLB123456"), "MLB");
    assert.equal(siteIdFromItemId("MLA987"), "MLA");
  });

  it("uppercases a lowercase prefix", () => {
    assert.equal(siteIdFromItemId("mlb123"), "MLB");
  });

  it("falls back to MLB when the id has no recognizable prefix", () => {
    assert.equal(siteIdFromItemId("123456"), "MLB");
    assert.equal(siteIdFromItemId(""), "MLB");
  });
});
