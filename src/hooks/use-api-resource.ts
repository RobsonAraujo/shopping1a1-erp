"use client";

import { useEffect, useRef, useState } from "react";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";

export type ApiResourceState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * Fetch de um recurso GET, só leitura, com estado padrão
 * (`data`/`loading`/`error`) — substitui o `useState`+`useEffect`+`fetch`
 * repetido em componentes client por toda a base (hoje: popular dropdowns
 * de fornecedor/produto em modais). Erros usam {@link readApiError} para
 * mensagem amigável.
 *
 * Sem `refetch`/setter local de propósito — nenhum consumidor atual precisa
 * disso, e os que fazem mutation-then-update usam o padrão de mesclar a
 * resposta da própria mutation em estado local (`useState` próprio), não
 * este hook. Se um consumidor futuro precisar refletir uma mutation aqui,
 * criar esse suporte então — em vez de expor uma API especulativa sem uso.
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
        setError(
          formatApiErrorMessage(
            e instanceof Error ? e.message : "request_failed",
          ),
        );
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }

    void run(url);
  }, [url, enabled, fallbackError]);

  return { data, loading, error };
}
