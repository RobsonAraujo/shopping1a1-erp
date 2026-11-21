/** Eventos SSE das ações longas do estoque (ativação, sincronizar). */
export type StockStreamEvent<TDone = unknown> =
  | {
      type: "progress";
      phase: "listings" | "orders" | "positions" | "saving";
      done?: number;
      total?: number;
    }
  | { type: "done"; result: TDone }
  | { type: "error"; message: string };

export function sseLine(event: StockStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Corpo SSE padrão: roda `work`, repassa o progresso e fecha com `done` ou
 * `error` (código já mapeado para mensagem no cliente — api-client-error.ts).
 */
export function stockStreamResponse<TDone>(
  request: Request,
  work: (send: (event: StockStreamEvent<TDone>) => void) => Promise<TDone>,
  mapError: (error: unknown) => string | null,
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: StockStreamEvent<TDone>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(sseLine(event as StockStreamEvent)));
      };
      try {
        const result = await work(send);
        send({ type: "done", result });
      } catch (e) {
        const message = mapError(e);
        if (message && !closed && !request.signal.aborted) send({ type: "error", message });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
