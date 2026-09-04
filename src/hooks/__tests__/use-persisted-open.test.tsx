import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, renderHook } from "@/test-setup/render";
import { usePersistedOpen } from "../use-persisted-open";

const KEY = "test.persisted-open";

afterEach(() => {
  localStorage.removeItem(KEY);
});

describe("usePersistedOpen", () => {
  it("uses defaultOpen when nothing is stored", () => {
    const { result, unmount } = renderHook(() => usePersistedOpen(KEY, true));
    assert.equal(result.current.open, true);
    unmount();
  });

  it("reads stored flags and can toggle them", () => {
    localStorage.setItem(KEY, "1");
    const { result, unmount } = renderHook(() => usePersistedOpen(KEY, false));
    assert.equal(result.current.open, true);

    act(() => {
      result.current.setOpen(false);
    });
    assert.equal(result.current.open, false);
    assert.equal(localStorage.getItem(KEY), "false");

    act(() => {
      result.current.toggle();
    });
    assert.equal(result.current.open, true);
    unmount();
  });

  it("treats unknown stored values as the default", () => {
    localStorage.setItem(KEY, "maybe");
    const { result, unmount } = renderHook(() => usePersistedOpen(KEY, false));
    assert.equal(result.current.open, false);
    unmount();
  });
});
