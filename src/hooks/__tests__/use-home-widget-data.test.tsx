import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { StrictMode } from "react";
import { act, renderHook, renderIntoDocument } from "@/test-setup/render";
import { useHomeWidgetData } from "@/hooks/use-home-widget-data";
import type { HomeWidgetDataKey } from "@/lib/home/dashboard/widget-data-keys";

function batchCalls(calls: { arguments: unknown[] }[]): string[] {
  return calls
    .map((call) => String(call.arguments[0]))
    .filter((url) => url.includes("/api/dashboard/widgets?"));
}

async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function okResponse(keys: readonly HomeWidgetDataKey[]) {
  return Response.json({
    resolvedAt: new Date().toISOString(),
    data: Object.fromEntries(
      keys.map((key) => [key, { ok: true, value: { key } }]),
    ),
  });
}

describe("useHomeWidgetData", () => {
  afterEach(() => mock.restoreAll());

  it("sobrevive ao ciclo duplo do StrictMode", async () => {
    // O Next liga `reactStrictMode` por padrão, então em dev o effect roda
    // mount -> cleanup -> mount. A limpeza abortava o request em voo E deixava a
    // chave marcada como "já pedida", então a segunda execução não pedia de novo:
    // o resultado nunca chegava e o card ficava em skeleton pra sempre.
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      okResponse(["finance"]),
    );

    const seen: { slices: unknown; loading: number }[] = [];
    function Probe() {
      const state = useHomeWidgetData(["finance"]);
      seen.push({ slices: state.slices, loading: state.loadingKeys.size });
      return null;
    }

    const view = renderIntoDocument(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await flush(10);

    const last = seen[seen.length - 1];
    assert.ok(
      last && (last.slices as Record<string, unknown>).finance,
      "a slice precisa chegar mesmo com o effect rodando duas vezes",
    );
    assert.equal(last.loading, 0, "não pode ficar carregando pra sempre");
    assert.ok(
      batchCalls(fetchMock.mock.calls).length <= 2,
      "no máximo um re-pedido — não pode virar laço",
    );
    view.unmount();
  });

  it("faz um request por conjunto de chaves, mesmo com o array recriado a cada render", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      okResponse(["finance"]),
    );

    // O array é literal novo em todo render — é assim que o provider chama.
    const view = renderHook(() => useHomeWidgetData(["finance"]));
    await flush();
    view.rerender();
    view.rerender();
    await flush();

    assert.equal(batchCalls(fetchMock.mock.calls).length, 1);
    view.unmount();
  });

  it("não entra em laço quando o request fica pendente", async () => {
    // A regressão que derrubou a Home: a lista de chaves faltantes era
    // calculada a partir do ref que o próprio effect escrevia E servia de
    // dependência. Registrar a chave encolhia a dep, o cleanup abortava o
    // request, a chave voltava a faltar e o effect rodava outra vez —
    // "Maximum update depth exceeded", com um request por volta. Só aparece com
    // request pendente: um fetch que resolve na hora escondia o problema.
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      () => new Promise<Response>(() => {}),
    );

    const view = renderHook(() => useHomeWidgetData(["finance"]));
    await flush(3);

    // Re-renders vindos de fora (o provider re-renderiza por N motivos: a ilha
    // de Vendas streamando, o layout mudando, um pai qualquer) são o gatilho do
    // laço. Um ciclo só não basta pra expor: o primeiro re-render encolhe a dep
    // e roda o cleanup, e é o SEGUINTE que reemite o request.
    for (let i = 0; i < 6; i += 1) {
      view.rerender();
      await flush(2);
    }

    assert.equal(
      batchCalls(fetchMock.mock.calls).length,
      1,
      "um request pendente não pode ser reemitido a cada re-render",
    );
    // e enquanto está pendente, a chave continua marcada como carregando
    assert.deepEqual([...view.result.current.loadingKeys], ["finance"]);
    view.unmount();
  });

  it("pede a chave quando ela passa a ser necessária, e só uma vez", async () => {
    // Enquanto existe uma chave de batch só, este é o análogo de "o conjunto
    // cresceu": sai de nenhuma chave visível para uma. O caso de duas chaves
    // distintas num request único volta junto com a segunda chave.
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      okResponse(["finance"]),
    );

    let keys: HomeWidgetDataKey[] = [];
    const view = renderHook(() => useHomeWidgetData(keys));
    await flush();
    assert.deepEqual(batchCalls(fetchMock.mock.calls), [], "sem chave, sem request");

    keys = ["finance"];
    view.rerender();
    await flush();

    const urls = batchCalls(fetchMock.mock.calls);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /keys=finance/);

    view.rerender();
    await flush();
    assert.equal(
      batchCalls(fetchMock.mock.calls).length,
      1,
      "a chave já resolvida não é repedida",
    );
    view.unmount();
  });

  it("encolher o conjunto não dispara request nem apaga o que já resolveu", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      okResponse(["finance"]),
    );

    let keys: HomeWidgetDataKey[] = ["finance"];
    const view = renderHook(() => useHomeWidgetData(keys));
    await flush();

    keys = [];
    view.rerender();
    await flush();
    keys = ["finance"];
    view.rerender();
    await flush();

    assert.equal(batchCalls(fetchMock.mock.calls).length, 1);
    assert.ok(view.result.current.slices.finance?.ok);
    view.unmount();
  });

  it("um erro de transporte não vira laço de requests", async () => {
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async () => new Response("boom", { status: 502 }),
    );

    const view = renderHook(() => useHomeWidgetData(["finance"]));
    await flush(10);
    view.rerender();
    await flush(10);

    assert.equal(batchCalls(fetchMock.mock.calls).length, 1);
    assert.ok(view.result.current.error, "o erro é reportado ao usuário");
    view.unmount();
  });

  it("reload permite uma nova tentativa depois do erro", async () => {
    let attempt = 0;
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      attempt += 1;
      return attempt === 1
        ? new Response("boom", { status: 502 })
        : okResponse(["finance"]);
    });

    const view = renderHook(() => useHomeWidgetData(["finance"]));
    await flush();
    assert.ok(view.result.current.error);

    await act(async () => {
      view.result.current.reload();
    });
    await flush();

    assert.equal(batchCalls(fetchMock.mock.calls).length, 2);
    assert.equal(view.result.current.error, null);
    assert.ok(view.result.current.slices.finance?.ok);
    view.unmount();
  });

  it("não busca nada quando não há chave pedida", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      okResponse([]),
    );
    const view = renderHook(() => useHomeWidgetData([]));
    await flush();
    assert.deepEqual(batchCalls(fetchMock.mock.calls), []);
    view.unmount();
  });
});
