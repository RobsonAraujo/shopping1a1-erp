import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { renderIntoDocument } from "@/test-setup/render";
import { AuthEventBeacon } from "../AuthEventBeacon";

type DataLayerWindow = Window & { dataLayer?: Record<string, unknown>[] };
const w = window as DataLayerWindow;

let cleanup: (() => void) | null = null;

beforeEach(() => {
  w.dataLayer = [];
  document.cookie = "maipo_auth_evt=; Max-Age=0; Path=/";
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function mount() {
  const rendered = renderIntoDocument(<AuthEventBeacon />);
  cleanup = rendered.unmount;
  return rendered;
}

describe("AuthEventBeacon", () => {
  it("fires sign_up once with the offer and clears the cookie", () => {
    document.cookie = "maipo_auth_evt=sign_up:beta-30d-2026-11; Path=/";
    mount();
    assert.deepEqual(w.dataLayer, [
      { event: "sign_up", method: "mercadolivre", offer: "beta-30d-2026-11" },
    ]);
    assert.doesNotMatch(document.cookie, /maipo_auth_evt=sign_up/);

    // Recarregar o dashboard não conta de novo.
    cleanup?.();
    mount();
    assert.equal(w.dataLayer?.length, 1);
  });

  it("fires login for a returning seller", () => {
    document.cookie = "maipo_auth_evt=login; Path=/";
    mount();
    assert.equal(w.dataLayer?.[0]?.event, "login");
  });

  it("does nothing without the cookie", () => {
    mount();
    assert.deepEqual(w.dataLayer, []);
  });
});
