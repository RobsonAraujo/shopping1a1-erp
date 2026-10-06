import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { StrictMode, useEffect } from "react";
import { act, renderHook, renderIntoDocument, waitFor } from "@/test-setup/render";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import {
  useEvaluationStream,
  type EvaluationRequest,
} from "../useEvaluationStream";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const encoder = new TextEncoder();

function sse(event: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function row(mlItemId: string): FinancialEvaluationRow {
  return { mlItemId, title: mlItemId } as FinancialEvaluationRow;
}

/** Stream controlado pelo teste (enfileira eventos quando quiser). */
function controllableStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    body,
    push: (event: unknown) => controller.enqueue(sse(event)),
    close: () => controller.close(),
  };
}

describe("useEvaluationStream", () => {
  it("collects meta and rows and finishes on complete", async () => {
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(
              sse({
                type: "meta",
                listingCount: 2,
                adsAvailable: true,
                adsUnavailableReason: null,
              }),
            );
            c.enqueue(sse({ type: "row", row: row("MLB1") }));
            c.enqueue(sse({ type: "row", row: row("MLB2") }));
            c.enqueue(sse({ type: "complete", mode: "period" }));
            c.close();
          },
        }),
        { status: 200 },
      );

    const request: EvaluationRequest = { kind: "period", from: "2026-10-01", to: "2026-10-06" };
    const { result, unmount } = renderHook(() => useEvaluationStream(request, 0));
    await waitFor(() => {
      assert.equal(result.current.status, "done");
      assert.deepEqual(
        result.current.rows.map((r) => r.mlItemId),
        ["MLB1", "MLB2"],
      );
      assert.equal(result.current.meta?.listingCount, 2);
    });
    unmount();
  });

  it("aborts the old stream on period change and ignores its late events", async () => {
    const streams: ReturnType<typeof controllableStream>[] = [];
    const signals: AbortSignal[] = [];
    globalThis.fetch = async (_input, init) => {
      const stream = controllableStream();
      streams.push(stream);
      signals.push(init!.signal!);
      return new Response(stream.body, { status: 200 });
    };

    let request: EvaluationRequest = { kind: "period", from: "2026-09-30", to: "2026-10-06" };
    const { result, rerender, unmount } = renderHook(() =>
      useEvaluationStream(request, 0),
    );
    await waitFor(() => assert.equal(streams.length, 1));
    streams[0].push({ type: "row", row: row("OLD-1") });
    await waitFor(() =>
      assert.deepEqual(result.current.rows.map((r) => r.mlItemId), ["OLD-1"]),
    );

    // troca de período: novo pedido, o antigo é abortado
    request = { kind: "period", from: "2026-07-09", to: "2026-10-06" };
    rerender();
    await waitFor(() => assert.equal(streams.length, 2));
    assert.equal(signals[0].aborted, true);
    assert.equal(result.current.status, "loading");
    assert.deepEqual(result.current.rows, []);

    // eventos atrasados do stream antigo não podem vazar pro novo período
    await act(async () => {
      streams[0].push({ type: "row", row: row("OLD-2") });
      streams[0].push({ type: "complete", mode: "period" });
    });
    streams[1].push({ type: "row", row: row("NEW-1") });
    streams[1].push({ type: "complete", mode: "period" });
    streams[1].close();

    await waitFor(() => {
      assert.equal(result.current.status, "done");
      assert.deepEqual(result.current.rows.map((r) => r.mlItemId), ["NEW-1"]);
    });
    unmount();
  });

  it("replaces a pending preview in place when the final row arrives", async () => {
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(sse({ type: "row", row: { ...row("A"), pending: true } }));
            c.enqueue(sse({ type: "row", row: { ...row("B"), pending: true } }));
            c.enqueue(sse({ type: "row", row: row("A") }));
            c.enqueue(sse({ type: "complete", mode: "current" }));
            c.close();
          },
        }),
        { status: 200 },
      );
    const { result, unmount } = renderHook(() =>
      useEvaluationStream({ kind: "simulation" }, 0),
    );
    await waitFor(() => {
      assert.equal(result.current.status, "done");
      assert.deepEqual(
        result.current.rows.map((r) => [r.mlItemId, Boolean(r.pending)]),
        [
          ["A", false],
          ["B", true],
        ],
      );
    });
    unmount();
  });

  it("resolves previews that arrive in an earlier batch, under StrictMode", async () => {
    // StrictMode (padrão do app router em dev) chama o updater do setState
    // duas vezes — o merge das linhas precisa ser puro, senão a prévia
    // "pending" de alguns anúncios nunca é trocada pela versão final.
    const streams: ReturnType<typeof controllableStream>[] = [];
    globalThis.fetch = async () => {
      const stream = controllableStream();
      streams.push(stream);
      return new Response(stream.body, { status: 200 });
    };
    const resultRef: { current: ReturnType<typeof useEvaluationStream> | null } = {
      current: null,
    };
    function Probe({
      onResult,
    }: {
      onResult: (value: ReturnType<typeof useEvaluationStream>) => void;
    }) {
      const value = useEvaluationStream({ kind: "simulation" }, 0);
      useEffect(() => onResult(value));
      return null;
    }
    const { unmount } = renderIntoDocument(
      <StrictMode>
        <Probe
          onResult={(value) => {
            resultRef.current = value;
          }}
        />
      </StrictMode>,
    );
    await waitFor(() => assert.ok(streams.length >= 1));
    const live = streams[streams.length - 1];
    live.push({ type: "row", row: { ...row("A"), pending: true } });
    live.push({ type: "row", row: { ...row("B"), pending: true } });
    await waitFor(() => assert.equal(resultRef.current?.rows.length, 2));

    // versões finais chegam num lote posterior
    live.push({ type: "row", row: row("A") });
    live.push({ type: "row", row: row("B") });
    live.push({ type: "complete", mode: "current" });
    live.close();
    await waitFor(() => {
      assert.equal(resultRef.current?.status, "done");
      assert.deepEqual(
        resultRef.current?.rows.map((r) => [r.mlItemId, Boolean(r.pending)]),
        [
          ["A", false],
          ["B", false],
        ],
      );
    });
    unmount();
  });

  it("does not leave previews blurred when the stream errors midway", async () => {
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(sse({ type: "row", row: { ...row("A"), pending: true, errors: [] } }));
            c.enqueue(sse({ type: "row", row: { ...row("B"), pending: true, errors: [] } }));
            c.enqueue(sse({ type: "row", row: { ...row("A"), errors: [] } }));
            c.enqueue(sse({ type: "error", message: "ml_unavailable" }));
            c.close();
          },
        }),
        { status: 200 },
      );
    const { result, unmount } = renderHook(() =>
      useEvaluationStream({ kind: "simulation" }, 0),
    );
    await waitFor(() => {
      assert.equal(result.current.status, "error");
      assert.match(result.current.error ?? "", /Mercado Livre não respondeu/);
      const b = result.current.rows.find((r) => r.mlItemId === "B");
      assert.equal(b?.pending, false);
      assert.equal(b?.breakdown, null);
      assert.equal(b?.errors.length, 1);
    });
    unmount();
  });

  it("flags a stream that ends without complete as interrupted", async () => {
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(sse({ type: "row", row: row("MLB1") }));
            c.close();
          },
        }),
        { status: 200 },
      );
    const { result, unmount } = renderHook(() =>
      useEvaluationStream({ kind: "simulation" }, 0),
    );
    await waitFor(() => {
      assert.equal(result.current.status, "interrupted");
      assert.equal(result.current.rows.length, 1);
    });
    unmount();
  });
});
