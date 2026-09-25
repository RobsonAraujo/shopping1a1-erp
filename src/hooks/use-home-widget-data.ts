"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import {
  serializeHomeWidgetDataKeys,
  type HomeWidgetDataKey,
  type HomeWidgetDataResponse,
  type HomeWidgetDataSlices,
} from "@/lib/home/dashboard/widget-data-keys";

/**
 * Busca as chaves de dado dos widgets visíveis num **único** request,
 * acumulando o resultado.
 *
 * As três propriedades que importam:
 *
 * - **Sem duplicata:** dois widgets que compartilham chave geram um fetch só,
 *   porque quem pede é a união de chaves, não cada widget.
 * - **Sem refetch ao personalizar:** o que já foi pedido fica registrado, então
 *   esconder e reexibir um widget custa zero request.
 * - **Sem re-disparo por identidade de array:** o effect depende da string de
 *   chaves desejadas, não do array.
 *
 * A dependência do effect é **só** `wantedParam`, derivado do que o chamador
 * pediu. O controle de "o que já foi pedido" mora num ref que o effect escreve
 * mas que **não** entra nas deps — e que o cleanup não desfaz.
 *
 * Essa separação não é estilo, é o que evita um laço infinito: quando a lista
 * de chaves faltantes era calculada a partir do ref E servia de dependência, o
 * effect mudava a própria dependência ao registrar a chave. A dep encolhia, o
 * cleanup rodava e abortava o request, a chave voltava a faltar, o effect
 * rodava de novo — "Maximum update depth exceeded" com um request por volta.
 */
export function useHomeWidgetData(keys: readonly HomeWidgetDataKey[]): {
  slices: HomeWidgetDataSlices;
  loadingKeys: ReadonlySet<HomeWidgetDataKey>;
  error: string | null;
  reload: (keys?: readonly HomeWidgetDataKey[]) => void;
} {
  const [slices, setSlices] = useState<HomeWidgetDataSlices>({});
  const [error, setError] = useState<string | null>(null);
  /** Chaves já pedidas nesta sessão do hook. Fora das deps de propósito. */
  const requestedRef = useRef<Set<HomeWidgetDataKey>>(new Set());
  /** Muda só em `reload()`, pra forçar uma nova rodada. */
  const [reloadToken, setReloadToken] = useState(0);

  // String estável (ordem canônica das chaves): não muda só porque o array foi
  // recriado no render do provider.
  const wantedParam = serializeHomeWidgetDataKeys(keys);

  useEffect(() => {
    if (wantedParam.length === 0) return;
    const wanted = wantedParam.split(",") as HomeWidgetDataKey[];
    const missing = wanted.filter((key) => !requestedRef.current.has(key));
    if (missing.length === 0) return;

    const requested = requestedRef.current;
    for (const key of missing) requested.add(key);
    const missingParam = serializeHomeWidgetDataKeys(missing);

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/widgets?keys=${encodeURIComponent(missingParam)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!res.ok) {
          const code = await readApiError(res, "request_failed");
          if (!cancelled) setError(formatApiErrorMessage(code));
          // Libera pra uma nova tentativa via "Atualizar" — mas sem re-pedir
          // sozinho, senão um 502 viraria laço de requests.
          for (const key of missing) requested.delete(key);
          return;
        }
        const json = (await res.json()) as HomeWidgetDataResponse;
        if (cancelled) return;
        setError(null);
        setSlices((current) => {
          const next = { ...current, ...json.data };
          // Chave pedida que não voltou na resposta fica marcada como
          // resolvida-com-erro: sem isso ela continuaria "faltando" e seria
          // pedida de novo a cada render.
          for (const key of missing) {
            if (!(key in next)) {
              next[key] = {
                ok: false,
                error: formatApiErrorMessage("request_failed"),
              };
            }
          }
          return next;
        });
      } catch (e) {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) return;
        setError(formatApiErrorMessage("request_failed"));
        for (const key of missing) requested.delete(key);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      // NÃO limpar `requested` aqui: era exatamente isso que realimentava o
      // laço. Um desmonte real descarta o ref junto.
    };
  }, [wantedParam, reloadToken]);

  /**
   * Carregando = o chamador quer a chave e ainda não existe resultado pra ela.
   * Derivado, não estado — um `setState` de Set novo dentro do effect
   * re-renderizava a cada rodada sem necessidade.
   */
  const loadingKeys = useMemo(() => {
    const pending = new Set<HomeWidgetDataKey>();
    if (wantedParam.length === 0) return pending;
    for (const key of wantedParam.split(",") as HomeWidgetDataKey[]) {
      if (!(key in slices)) pending.add(key);
    }
    return pending;
    // Chaveado na string, não no array: assim o hook não obriga o chamador a
    // memoizar o array pra evitar um Set novo (e um contexto novo) por render.
  }, [wantedParam, slices]);

  const reload = useCallback((target?: readonly HomeWidgetDataKey[]) => {
    setError(null);
    if (target) {
      for (const key of target) requestedRef.current.delete(key);
    } else {
      requestedRef.current.clear();
    }
    setSlices((current) => {
      if (!target) return {};
      const next = { ...current };
      for (const key of target) delete next[key];
      return next;
    });
    setReloadToken((token) => token + 1);
  }, []);

  return { slices, loadingKeys, error, reload };
}
