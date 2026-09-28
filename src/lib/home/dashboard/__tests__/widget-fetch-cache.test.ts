import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearWidgetFetch,
  readWidgetFetch,
  runWidgetFetch,
  subscribeWidgetFetch,
} from "@/lib/home/dashboard/widget-fetch-cache";

/**
 * Este cache existe por um motivo específico: no layout em colunas, arrastar um
 * card entre colunas **remonta** o widget (dois containers React = dois pais, e
 * mover um fiber entre pais é unmount + mount). Sem cache, cada arrasto
 * re-dispararia a varredura de anúncios no Mercado Livre.
 */
describe("widget-fetch-cache", () => {
  afterEach(() => clearWidgetFetch());

  it("dispara a busca uma vez e reaproveita o resultado", async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return "valor";
    };

    runWidgetFetch("k", run);
    await new Promise((r) => setTimeout(r, 0));

    assert.deepEqual(readWidgetFetch("k"), { status: "ok", value: "valor" });
    // uma remontagem chama de novo e não deve buscar
    runWidgetFetch("k", run);
    runWidgetFetch("k", run);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls, 1);
  });

  it("compartilha a busca em voo entre chamadas concorrentes", async () => {
    let calls = 0;
    const holder: { resolve: ((value: string) => void) | null } = {
      resolve: null,
    };
    const run = () => {
      calls += 1;
      return new Promise<string>((r) => {
        holder.resolve = r;
      });
    };

    runWidgetFetch("k", run);
    runWidgetFetch("k", run);
    runWidgetFetch("k", run);
    assert.equal(calls, 1, "três chamadas durante o voo = um request");
    assert.deepEqual(readWidgetFetch("k"), { status: "loading" });

    holder.resolve?.("pronto");
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(readWidgetFetch("k"), { status: "ok", value: "pronto" });
  });

  it("guarda o erro em vez de tentar de novo em laço", async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      throw new Error("boom");
    };

    runWidgetFetch("k", run);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(readWidgetFetch("k"), { status: "error", error: "boom" });

    runWidgetFetch("k", run);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls, 1, "erro cacheado não vira laço de requests");
  });

  it("clear força nova busca", async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return calls;
    };

    runWidgetFetch("k", run);
    await new Promise((r) => setTimeout(r, 0));
    clearWidgetFetch("k");
    runWidgetFetch("k", run);
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(calls, 2);
    assert.deepEqual(readWidgetFetch("k"), { status: "ok", value: 2 });
  });

  it("isola chaves diferentes", async () => {
    const run = async (v: string) => v;
    runWidgetFetch("a", () => run("A"));
    runWidgetFetch("b", () => run("B"));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(readWidgetFetch("a"), { status: "ok", value: "A" });
    assert.deepEqual(readWidgetFetch("b"), { status: "ok", value: "B" });
  });

  it("clear global NÃO órfã quem está inscrito", async () => {
    // Regressão: `clearWidgetFetch()` sem chave apagava o mapa, e quem estava
    // inscrito guardava um closure sobre o registro antigo. O `ensure()` seguinte
    // criava um registro novo, a busca resolvia para um conjunto de listeners
    // vazio e o componente ficava carregando pra sempre.
    let notified = 0;
    const unsubscribe = subscribeWidgetFetch("k", () => {
      notified += 1;
    });

    runWidgetFetch("k", async () => "primeiro");
    await new Promise((r) => setTimeout(r, 0));
    const afterFirst = notified;
    assert.ok(afterFirst > 0);

    clearWidgetFetch();
    runWidgetFetch("k", async () => "segundo");
    await new Promise((r) => setTimeout(r, 0));

    assert.ok(
      notified > afterFirst,
      "o mesmo listener precisa continuar sendo avisado depois do clear global",
    );
    assert.deepEqual(readWidgetFetch("k"), { status: "ok", value: "segundo" });
    unsubscribe();
  });

  it("avisa quem assinou quando resolve", async () => {
    let notified = 0;
    const unsubscribe = subscribeWidgetFetch("k", () => {
      notified += 1;
    });
    runWidgetFetch("k", async () => "x");
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(notified > 0);
    unsubscribe();
  });
});
