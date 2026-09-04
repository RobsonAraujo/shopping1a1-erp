import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, renderHook, waitFor } from "@/test-setup/render";
import { useApiResource } from "../use-api-resource";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useApiResource", () => {
  it("loads JSON into data", async () => {
    globalThis.fetch = async () => jsonResponse({ sku: "ABC" });
    const { result, unmount } = renderHook(() =>
      useApiResource<{ sku: string }>("/api/products/1"),
    );
    await waitFor(() => {
      assert.deepEqual(result.current.data, { sku: "ABC" });
      assert.equal(result.current.loading, false);
      assert.equal(result.current.error, null);
    });
    unmount();
  });

  it("maps an error response to a friendly message", async () => {
    globalThis.fetch = async () =>
      jsonResponse({ error: "products_load_failed" }, 500);
    const { result, unmount } = renderHook(() =>
      useApiResource("/api/products"),
    );
    await waitFor(() => {
      assert.equal(result.current.data, null);
      assert.equal(
        result.current.error,
        "Não foi possível carregar os produtos.",
      );
    });
    unmount();
  });

  it("does not fetch when url is null or enabled is false", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse({});
    };
    const disabled = renderHook(() =>
      useApiResource("/api/x", { enabled: false }),
    );
    const waiting = renderHook(() => useApiResource(null));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(calls, 0);
    disabled.unmount();
    waiting.unmount();
  });

  it("refetch issues a second request", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse({ n: calls });
    };
    const { result, unmount } = renderHook(() =>
      useApiResource<{ n: number }>("/api/n"),
    );
    await waitFor(() => {
      assert.equal(result.current.data?.n, 1);
    });
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => {
      assert.equal(result.current.data?.n, 2);
    });
    unmount();
  });
});
