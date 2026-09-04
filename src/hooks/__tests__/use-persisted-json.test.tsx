import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, renderHook } from "@/test-setup/render";
import {
  getPersistedJsonValue,
  setPersistedJsonValue,
  usePersistedJson,
} from "../use-persisted-json";

const KEY = "test.persisted-json";
const DEFAULT_VALUE = { days: 30 };

afterEach(() => {
  localStorage.removeItem(KEY);
});

describe("getPersistedJsonValue / setPersistedJsonValue", () => {
  it("returns the default when the key is empty", () => {
    assert.deepEqual(getPersistedJsonValue(KEY, DEFAULT_VALUE), DEFAULT_VALUE);
  });

  it("round-trips a JSON value through the shared store", () => {
    setPersistedJsonValue(KEY, { days: 45 });
    assert.deepEqual(getPersistedJsonValue(KEY, DEFAULT_VALUE), { days: 45 });
    assert.equal(localStorage.getItem(KEY), JSON.stringify({ days: 45 }));
  });

  it("falls back to the default when stored JSON is invalid", () => {
    localStorage.setItem(KEY, "{not-json");
    assert.deepEqual(getPersistedJsonValue(KEY, DEFAULT_VALUE), DEFAULT_VALUE);
  });
});

describe("usePersistedJson", () => {
  it("exposes the stored value and updates it", () => {
    setPersistedJsonValue(KEY, { days: 12 });
    const { result, unmount } = renderHook(() =>
      usePersistedJson(KEY, DEFAULT_VALUE),
    );
    assert.deepEqual(result.current[0], { days: 12 });
    act(() => {
      result.current[1]({ days: 99 });
    });
    assert.deepEqual(result.current[0], { days: 99 });
    unmount();
  });
});
