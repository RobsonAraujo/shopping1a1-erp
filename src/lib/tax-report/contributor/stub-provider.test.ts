import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StubContributorProvider } from "@/lib/tax-report/contributor/stub-provider";

describe("StubContributorProvider", () => {
  it("returns non-contributor on stub fallback", async () => {
    const stub = new StubContributorProvider();
    const result = await stub.verificarContribuinteIcms("12345678000199");
    assert.equal(result.isContributor, false);
    assert.equal(result.provider, "stub");
  });

  it("simulates API failure path with manual catch", async () => {
    const failingProvider = {
      async verificarContribuinteIcms() {
        throw new Error("API down");
      },
    };
    const stub = new StubContributorProvider();
    let result;
    try {
      await failingProvider.verificarContribuinteIcms("12345678000199");
      assert.fail("expected throw");
    } catch {
      result = await stub.verificarContribuinteIcms("12345678000199");
    }
    assert.equal(result.isContributor, false);
    assert.equal(result.provider, "stub");
  });
});
