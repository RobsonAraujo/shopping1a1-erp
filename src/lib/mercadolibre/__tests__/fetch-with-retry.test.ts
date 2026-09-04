import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchWithRetry,
  isRetryableMlStatus,
  MlApiFetchError,
} from "../fetch-with-retry";

describe("isRetryableMlStatus", () => {
  it("retries 429 and 5xx", () => {
    assert.equal(isRetryableMlStatus(429), true);
    assert.equal(isRetryableMlStatus(500), true);
    assert.equal(isRetryableMlStatus(503), true);
  });

  it("does not retry 4xx except 429", () => {
    assert.equal(isRetryableMlStatus(401), false);
    assert.equal(isRetryableMlStatus(404), false);
  });
});

describe("fetchWithRetry", () => {
  it("retries 429 and succeeds on later attempt", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = async () => {
      calls += 1;
      if (calls < 2) {
        return new Response(null, { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    try {
      const res = await fetchWithRetry("https://example.test", {
        cache: "no-store",
      });
      assert.equal(res.ok, true);
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws MlApiFetchError after retries are exhausted", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 429 });

    try {
      await assert.rejects(
        () =>
          fetchWithRetry(
            "https://example.test/rate-limited",
            { cache: "no-store" },
            { maxAttempts: 2, backoffMs: [0] },
          ),
        (error: unknown) => {
          assert.ok(error instanceof MlApiFetchError);
          assert.equal(error.status, 429);
          assert.match(error.url, /rate-limited/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not retry non-retryable 401", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, { status: 401 });
    };

    try {
      await assert.rejects(
        () => fetchWithRetry("https://example.test", { cache: "no-store" }),
        MlApiFetchError,
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
