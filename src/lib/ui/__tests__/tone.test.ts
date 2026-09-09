import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { valueToneClass } from "@/lib/ui/tone";

describe("valueToneClass", () => {
  it("uses the emerald (positive) class for a value above zero", () => {
    assert.equal(valueToneClass(0.01), "text-emerald-800");
    assert.equal(valueToneClass(100), "text-emerald-800");
  });

  it("uses the rose (negative) class for a value below zero", () => {
    assert.equal(valueToneClass(-0.01), "text-rose-800");
    assert.equal(valueToneClass(-100), "text-rose-800");
  });

  it("uses the muted class for exactly zero", () => {
    assert.equal(valueToneClass(0), "text-[var(--muted-foreground)]");
  });

  it("uses the muted class for null/undefined (no value to judge)", () => {
    assert.equal(valueToneClass(null), "text-[var(--muted-foreground)]");
    assert.equal(valueToneClass(undefined), "text-[var(--muted-foreground)]");
  });
});
