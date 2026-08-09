import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DRE_DISCLAIMER_MENU, DRE_DISCLAIMER_PAGE } from "../dre-disclaimer";

describe("dre-disclaimer", () => {
  it("exports non-empty menu and page disclaimer strings", () => {
    assert.ok(DRE_DISCLAIMER_MENU.length > 0);
    assert.ok(DRE_DISCLAIMER_PAGE.length > 0);
  });

  it("both mention the DRE is not fully operational", () => {
    assert.match(DRE_DISCLAIMER_MENU, /não funciona corretamente/);
    assert.match(DRE_DISCLAIMER_PAGE, /não está operacional/);
  });
});
