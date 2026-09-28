import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderHook } from "@/test-setup/render";
import { useWidgetFetch } from "@/hooks/use-widget-fetch";
import { clearWidgetFetch } from "@/lib/home/dashboard/widget-fetch-cache";

async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("useWidgetFetch", () => {
  afterEach(() => {
    mock.restoreAll();
    clearWidgetFetch();
  });

  it("busca uma vez e entrega o valor", async () => {
    let calls = 0;
    const view = renderHook(() =>
      useWidgetFetch(
        "k1",
        async () => {
          calls += 1;
          return "valor";
        },
        true,
      ),
    );
    await flush();

    assert.deepEqual(view.result.current, { status: "ok", value: "valor" });
    view.rerender();
    view.rerender();
    await flush();
    assert.equal(calls, 1, "re-render não pode re-buscar");
    view.unmount();
  });

  it("não busca enquanto `enabled` é falso", async () => {
    let calls = 0;
    const view = renderHook(() =>
      useWidgetFetch(
        "k2",
        async () => {
          calls += 1;
          return "x";
        },
        false,
      ),
    );
    await flush();
    assert.equal(calls, 0, "é o que mantém o widget fora da viewport barato");
    assert.deepEqual(view.result.current, { status: "loading" });
    view.unmount();
  });

  it("volta a buscar depois de limpar o cache (o caminho do Atualizar)", async () => {
    // Regressão: as deps do effect eram `[key, enabled]`, e nenhuma muda quando o
    // cache é limpo. O entry voltava pra "loading" e NADA disparava outra busca —
    // clicar em "Atualizar" deixava o card preso em skeleton.
    let calls = 0;
    const run = async () => {
      calls += 1;
      return `valor ${calls}`;
    };

    const view = renderHook(() => useWidgetFetch("k3", run, true));
    await flush();
    assert.deepEqual(view.result.current, { status: "ok", value: "valor 1" });

    await act(async () => {
      clearWidgetFetch();
    });
    await flush();

    assert.equal(calls, 2, "o clear precisa disparar nova busca");
    assert.deepEqual(view.result.current, { status: "ok", value: "valor 2" });
    view.unmount();
  });

  it("guarda o erro sem virar laço", async () => {
    let calls = 0;
    const view = renderHook(() =>
      useWidgetFetch(
        "k4",
        async () => {
          calls += 1;
          throw new Error("boom");
        },
        true,
      ),
    );
    await flush(10);
    view.rerender();
    await flush(10);

    assert.deepEqual(view.result.current, { status: "error", error: "boom" });
    assert.equal(calls, 1);
    view.unmount();
  });

  it("duas instâncias da mesma chave compartilham uma busca", async () => {
    // É o que protege de remontagem (arrasto entre colunas) e de dois widgets
    // lendo o mesmo endpoint.
    let calls = 0;
    const run = async () => {
      calls += 1;
      return "compartilhado";
    };
    const a = renderHook(() => useWidgetFetch("k5", run, true));
    const b = renderHook(() => useWidgetFetch("k5", run, true));
    await flush();

    assert.equal(calls, 1);
    assert.deepEqual(a.result.current, { status: "ok", value: "compartilhado" });
    assert.deepEqual(b.result.current, { status: "ok", value: "compartilhado" });
    a.unmount();
    b.unmount();
  });
});
