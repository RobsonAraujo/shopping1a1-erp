import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, renderHook, waitFor } from "@/test-setup/render";
import { useSSEStream } from "../use-sse-stream";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("useSSEStream", () => {
  it("forwards decoded events and clears streaming when the body ends", async () => {
    const encoder = new TextEncoder();
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"type":"ok"}\n\n'));
            controller.close();
          },
        }),
        { status: 200 },
      );

    const events: Array<{ type: string }> = [];
    const { result, unmount } = renderHook(() =>
      useSSEStream<{ type: string }>((event) => {
        events.push(event);
      }),
    );

    let closedCleanly: boolean | undefined;
    await act(async () => {
      closedCleanly = await result.current.start("/api/stream");
    });
    await waitFor(() => {
      assert.deepEqual(events, [{ type: "ok" }]);
      assert.equal(result.current.streaming, false);
      assert.equal(result.current.error, null);
    });
    assert.equal(closedCleanly, true);
    unmount();
  });

  it("stores a friendly error when the response is not ok", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "stream_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });

    const { result, unmount } = renderHook(() => useSSEStream(() => {}));
    let closedCleanly: boolean | undefined;
    await act(async () => {
      closedCleanly = await result.current.start("/api/stream");
    });
    await waitFor(() => {
      assert.match(
        result.current.error ?? "",
        /A atualização em tempo real foi interrompida/,
      );
      assert.equal(result.current.streaming, false);
    });
    assert.equal(closedCleanly, false);
    unmount();
  });

  it("reports a failure when a handler throws on a server error event", async () => {
    const encoder = new TextEncoder();
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"type":"error","message":"falhou"}\n\n'),
            );
            controller.close();
          },
        }),
        { status: 200 },
      );

    const { result, unmount } = renderHook(() =>
      useSSEStream<{ type: string; message: string }>((event) => {
        throw new Error(event.message);
      }),
    );
    let closedCleanly: boolean | undefined;
    await act(async () => {
      closedCleanly = await result.current.start("/api/stream");
    });
    assert.equal(closedCleanly, false);
    assert.equal(result.current.error, "falhou");
    unmount();
  });
});
