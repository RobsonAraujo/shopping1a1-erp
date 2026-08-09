"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readApiError } from "@/lib/api-client-error";

export type ApiResourceState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Fetch de um recurso GET com estado padrão (`data`/`loading`/`error`) e
 * `refetch` manual — substitui o `useState`+`useEffect`+`fetch` repetido em
 * componentes client por toda a base. Erros usam {@link readApiError} para
 * mensagem amigável.
 *
 * `url: null` pula o fetch (útil quando os parâmetros ainda não estão
 * prontos, ex.: aguardando um id vindo de outro estado).
 */
export function useApiResource<T>(
  url: string | null,
  options?: { fallbackError?: string; enabled?: boolean },
): ApiResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestIdRef = useRef(0);

  const fallbackError = options?.fallbackError ?? "request_failed";
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!url || !enabled) return;

    async function run(thisUrl: string) {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(thisUrl);
        if (requestId !== requestIdRef.current) return;
        if (!res.ok) {
          throw new Error(await readApiError(res, fallbackError));
        }
        const json = (await res.json()) as T;
        setData(json);
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        setError(e instanceof Error ? e.message : "Erro de rede");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }

    void run(url);
  }, [url, enabled, reloadToken, fallbackError]);

  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  return { data, loading, error, refetch };
}
