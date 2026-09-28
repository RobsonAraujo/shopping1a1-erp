"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  readWidgetFetch,
  readWidgetFetchGeneration,
  runWidgetFetch,
  subscribeWidgetFetch,
  type WidgetFetchEntry,
} from "@/lib/home/dashboard/widget-fetch-cache";

/** Identidade estável para o estado "ainda não busquei". `getSnapshot` do
 * `useSyncExternalStore` **precisa** devolver o mesmo objeto enquanto nada
 * muda — devolver `{ status: "loading" }` novo a cada leitura vira laço de
 * render ("The result of getSnapshot should be cached"). */
const LOADING: WidgetFetchEntry<never> = { status: "loading" };

/**
 * Lê um widget que busca dado por conta própria, através do cache de módulo
 * (`widget-fetch-cache`). O cache é o que faz uma remontagem — arrastar o card
 * entre colunas, esconder e reexibir, trocar de versão — reaproveitar o
 * resultado em vez de bater no Mercado Livre de novo.
 *
 * `enabled` normalmente é o `inView`: a busca só começa quando o card chega
 * perto da viewport.
 */
export function useWidgetFetch<T>(
  key: string,
  run: () => Promise<T>,
  enabled: boolean,
): WidgetFetchEntry<T> {
  const subscribe = useCallback(
    (listener: () => void) => subscribeWidgetFetch(key, listener),
    [key],
  );
  const getSnapshot = useCallback(
    () => (readWidgetFetch<T>(key) ?? LOADING) as WidgetFetchEntry<T>,
    [key],
  );

  const entry = useSyncExternalStore(subscribe, getSnapshot, () => LOADING);
  const generation = useSyncExternalStore(
    subscribe,
    () => readWidgetFetchGeneration(key),
    () => 0,
  );

  // `run` muda de identidade a cada render (closure do componente), então fica
  // fora das deps de propósito: quem decide se busca é a chave + `enabled`, e o
  // cache é quem garante uma execução só.
  //
  // `generation` ENTRA nas deps: sem ela, um "Atualizar" (que invalida o cache)
  // deixava o entry em "loading" e nada disparava a nova busca — o card ficava
  // em skeleton. `runWidgetFetch` é no-op quando já há resultado ou busca em
  // voo, então re-executar aqui é seguro.
  useEffect(() => {
    if (!enabled) return;
    runWidgetFetch(key, run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, generation]);

  return entry;
}
