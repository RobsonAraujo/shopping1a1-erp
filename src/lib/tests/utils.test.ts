import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cn } from "../utils";

describe("cn", () => {
  it("joins plain class strings", () => {
    assert.equal(cn("a", "b"), "a b");
  });

  it("drops falsy values", () => {
    assert.equal(cn("a", false && "b", null, undefined, "c"), "a c");
  });

  it("merges conflicting tailwind classes, keeping the last one", () => {
    assert.equal(cn("px-2", "px-4"), "px-4");
  });

  it("supports conditional object syntax", () => {
    assert.equal(cn({ active: true, hidden: false }), "active");
  });
});
