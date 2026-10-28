import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderHook } from "@/test-setup/render";
import { useBeforeUnloadGuard } from "../use-before-unload-guard";

function dispatchBeforeUnload(): boolean {
  const event = new window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useBeforeUnloadGuard", () => {
  it("asks for confirmation only while a process is running", () => {
    let active = true;
    const { rerender, unmount } = renderHook(() => useBeforeUnloadGuard(active));
    assert.equal(dispatchBeforeUnload(), true);

    active = false;
    rerender();
    assert.equal(dispatchBeforeUnload(), false);
    unmount();
  });

  it("removes the guard when the screen unmounts", () => {
    const { unmount } = renderHook(() => useBeforeUnloadGuard(true));
    unmount();
    assert.equal(dispatchBeforeUnload(), false);
  });
});
