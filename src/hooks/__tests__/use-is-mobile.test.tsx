import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { renderHook } from "@/test-setup/render";
import { useIsMobile } from "../use-is-mobile";

const originalMatchMedia = window.matchMedia;

function stubMatchMedia(matches: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useIsMobile", () => {
  it("is false when the viewport is wider than the mobile breakpoint", () => {
    stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useIsMobile());
    assert.equal(result.current, false);
    unmount();
  });

  it("is true when the viewport matches the mobile query", () => {
    stubMatchMedia(true);
    const { result, unmount } = renderHook(() => useIsMobile());
    assert.equal(result.current, true);
    unmount();
  });
});
