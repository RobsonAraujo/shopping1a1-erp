import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, renderHook } from "@/test-setup/render";
import { DEFAULT_SLOW_MOVER_THRESHOLD_DAYS } from "@/lib/insights/slow-movers";
import {
  SLOW_MOVER_THRESHOLD_STORAGE_KEY,
  useSlowMoverThreshold,
} from "../use-slow-mover-threshold";

afterEach(() => {
  localStorage.removeItem(SLOW_MOVER_THRESHOLD_STORAGE_KEY);
});

describe("useSlowMoverThreshold", () => {
  it("starts at the domain default and persists changes", () => {
    const { result, unmount } = renderHook(() => useSlowMoverThreshold());
    assert.equal(result.current[0], DEFAULT_SLOW_MOVER_THRESHOLD_DAYS);
    act(() => {
      result.current[1](60);
    });
    assert.equal(result.current[0], 60);
    assert.equal(
      localStorage.getItem(SLOW_MOVER_THRESHOLD_STORAGE_KEY),
      "60",
    );
    unmount();
  });
});
