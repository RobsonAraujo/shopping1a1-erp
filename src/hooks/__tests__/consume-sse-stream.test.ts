import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consumeSSEStream } from "../use-sse-stream";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        return;
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe("consumeSSEStream", () => {
  it("decodes data: lines in arrival order and ignores keep-alives", async () => {
    const events: Array<{ type: string }> = [];
    await consumeSSEStream<{ type: string }>(
      sseResponse([
        "data: {\"type\":\"start\"}\n\n",
        ": keep-alive\n\n",
        "data: {\"type\":\"done\"}\n\n",
      ]),
      (event) => {
        events.push(event);
      },
    );
    assert.deepEqual(events, [{ type: "start" }, { type: "done" }]);
  });

  it("reassembles an event split across chunks", async () => {
    const events: Array<{ n: number }> = [];
    await consumeSSEStream<{ n: number }>(
      sseResponse(["data: {\"n\":", "1}\n\n"]),
      (event) => {
        events.push(event);
      },
    );
    assert.deepEqual(events, [{ n: 1 }]);
  });

  it("throws when the response has no body", async () => {
    const response = {
      body: null,
      json: async () => ({ error: "stream_failed" }),
    } as unknown as Response;
    await assert.rejects(
      () => consumeSSEStream(response, () => {}),
      /A atualização em tempo real foi interrompida/,
    );
  });
});
