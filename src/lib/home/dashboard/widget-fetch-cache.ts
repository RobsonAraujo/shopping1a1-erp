/**
 * Cache de módulo para os widgets que buscam dado por conta própria (PMA e
 * promoções — os dois que batem no Mercado Livre).
 *
 * **Por que isso existe:** no layout em colunas, arrastar um card de uma coluna
 * para a outra o **remonta**. Duas colunas são dois containers React
 * diferentes, e mover um fiber entre pais é unmount + mount — `memo` e key
 * estável não evitam isso. Sem cache, cada arrasto entre colunas re-dispararia
 * a varredura de anúncios no ML (centenas de chamadas num seller médio). O
 * mesmo vale para esconder/reexibir o card e para trocar de versão do
 * dashboard.
 *
 * É cache de **sessão de aba**, por chave (o endpoint). Não persiste: o objetivo
 * é sobreviver a remontagem dentro da mesma visita, não guardar dado entre
 * visitas — para isso existiria snapshot no banco.
 *
 * Escopo de módulo é seguro aqui porque o browser de uma aba pertence a um
 * usuário e uma organização só. **Não** replicar este padrão no servidor, onde
 * escopo de módulo vaza entre requisições/tenants.
 */

export type WidgetFetchEntry<T> =
  | { status: "loading" }
  | { status: "ok"; value: T }
  | { status: "error"; error: string };

type InternalEntry = {
  entry: WidgetFetchEntry<unknown>;
  promise?: Promise<void>;
  listeners: Set<() => void>;
  /** Sobe a cada `clearWidgetFetch`. Entra no snapshot pra quem lê perceber que
   * precisa buscar de novo — sem isso o entry volta pra "loading" e nada
   * dispara a nova busca (era o caminho do botão "Atualizar"). */
  generation: number;
};

const cache = new Map<string, InternalEntry>();

function ensure(key: string): InternalEntry {
  let existing = cache.get(key);
  if (!existing) {
    existing = {
      entry: { status: "loading" },
      listeners: new Set(),
      generation: 0,
    };
    cache.set(key, existing);
  }
  return existing;
}

export function readWidgetFetch<T>(key: string): WidgetFetchEntry<T> | undefined {
  return cache.get(key)?.entry as WidgetFetchEntry<T> | undefined;
}

/** Quantas vezes a chave foi invalidada. Quem lê usa isso pra saber que precisa
 * buscar de novo depois de um "Atualizar". */
export function readWidgetFetchGeneration(key: string): number {
  return cache.get(key)?.generation ?? 0;
}

export function subscribeWidgetFetch(key: string, listener: () => void): () => void {
  const record = ensure(key);
  record.listeners.add(listener);
  return () => {
    record.listeners.delete(listener);
  };
}

function publish(record: InternalEntry, entry: WidgetFetchEntry<unknown>): void {
  record.entry = entry;
  record.promise = undefined;
  for (const listener of record.listeners) listener();
}

/**
 * Dispara `run` se ainda não houver resultado nem busca em voo para a chave.
 * Chamadas concorrentes compartilham a mesma promessa — dois widgets (ou um
 * widget remontado) não geram dois requests.
 */
export function runWidgetFetch<T>(
  key: string,
  run: () => Promise<T>,
): WidgetFetchEntry<T> {
  const record = ensure(key);

  if (record.entry.status === "ok" || record.entry.status === "error") {
    return record.entry as WidgetFetchEntry<T>;
  }
  if (record.promise) return record.entry as WidgetFetchEntry<T>;

  record.entry = { status: "loading" };
  record.promise = run()
    .then((value) => {
      publish(record, { status: "ok", value });
    })
    .catch((error: unknown) => {
      publish(record, {
        status: "error",
        error:
          error instanceof Error && error.message
            ? error.message
            : "request_failed",
      });
    });

  return record.entry as WidgetFetchEntry<T>;
}

function reset(record: InternalEntry): void {
  record.entry = { status: "loading" };
  record.promise = undefined;
  record.generation += 1;
  for (const listener of record.listeners) listener();
}

/**
 * Esquece o resultado para forçar nova busca (botão "Atualizar" e testes).
 *
 * **Nunca apaga o mapa.** Quem assina guarda um closure sobre o registro, então
 * `cache.clear()` órfãnava os inscritos: o `ensure()` seguinte criava um registro
 * novo e a busca resolvia para um conjunto de listeners vazio — o componente
 * nunca re-renderizava e ficava carregando pra sempre. O registro pertence a
 * quem assinou, não ao mapa.
 */
export function clearWidgetFetch(key?: string): void {
  if (key === undefined) {
    for (const [, record] of cache) reset(record);
    return;
  }
  const record = cache.get(key);
  if (record) reset(record);
}
