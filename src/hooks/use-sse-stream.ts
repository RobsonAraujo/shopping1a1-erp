"use client";

import { useCallback, useRef, useState } from "react";
import { readApiError } from "@/lib/api/api-client-error";

/**
 * Lê um `Response` no formato `text/event-stream` (linhas `data: {...json...}\n\n`,
 * o mesmo padrão usado por `sseLine()` no servidor — ver Lucratividade, DRE sync
 * e monthly-tax) e chama `onEvent` para cada objeto decodificado, na ordem de
 * chegada. Não assume nenhum formato de evento — quem chama decide o shape via
 * `TEvent` e trata cada variante (ex.: um discriminated union com `type`).
 */
export async function consumeSSEStream<TEvent>(
  response: Response,
  onEvent: (event: TEvent) => void | Promise<void>,
): Promise<void> {
  if (!response.body) {
    throw new Error(await readApiError(response, "stream_failed"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data: ")) continue;
      await onEvent(JSON.parse(line.slice(6)) as TEvent);
    }
  }
}

export type UseSSEStreamState = {
  streaming: boolean;
  error: string | null;
};

/**
 * Wrapper de {@link consumeSSEStream} com estado de `streaming`/`error` pronto
 * pra uso em componente — dispara `fetch(input, init)` e repassa cada evento
 * decodificado pra `onEvent`, igual ao fluxo já usado em Lucratividade/DRE/Flex,
 * só sem repetir o parsing manual de `data: ` em cada componente novo.
 */
export function useSSEStream<TEvent>(
  onEvent: (event: TEvent) => void | Promise<void>,
): UseSSEStreamState & { start: (input: RequestInfo, init?: RequestInit) => Promise<void> } {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const start = useCallback(
    async (input: RequestInfo, init?: RequestInit) => {
      setStreaming(true);
      setError(null);
      try {
        const res = await fetch(input, init);
        if (!res.ok || !res.body) {
          throw new Error(await readApiError(res, "stream_failed"));
        }
        await consumeSSEStream<TEvent>(res, (event) => onEventRef.current(event));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro de rede");
      } finally {
        setStreaming(false);
      }
    },
    [],
  );

  return { streaming, error, start };
}
