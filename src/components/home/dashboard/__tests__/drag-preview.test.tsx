import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useEffect } from "react";
import { act, renderIntoDocument } from "@/test-setup/render";
import { renderCardDragPreview } from "@/lib/home/dashboard/drag-preview";

let mounts = 0;

/** Um card com effect, campo de texto e checkbox — o formato do Notas rápidas. */
function FakeCard() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <div data-widget-id="notas" className="rounded-3xl">
      <h2>Notas rápidas</h2>
      <p>corpo do card</p>
      <textarea defaultValue="" aria-label="nota" />
      <input type="checkbox" aria-label="feito" />
    </div>
  );
}

async function setup() {
  mounts = 0;
  const view = renderIntoDocument(<FakeCard />);
  await act(async () => {});

  const source = view.container.querySelector<HTMLElement>("[data-widget-id]");
  assert.ok(source, "o card precisa estar no DOM");
  // Estado vivo, sem atributo no HTML: é o que `cloneNode` não copia sozinho.
  source.querySelector("textarea")!.value = "comprar caixa";
  source.querySelector("input")!.checked = true;

  const container = document.createElement("div");
  document.body.append(container);
  renderCardDragPreview({ source, container, width: 420 });

  return { view, source, container };
}

describe("renderCardDragPreview", () => {
  it("o fantasma é o card inteiro, na largura do card", async () => {
    const { view, container } = await setup();

    assert.match(container.textContent ?? "", /Notas rápidas/);
    assert.match(container.textContent ?? "", /corpo do card/);
    // Sem largura explícita o card `w-full` encolhe para o conteúdo, porque o
    // container do pdnd é shrink-to-fit.
    assert.equal(container.style.width, "420px");
    container.remove();
    view.unmount();
  });

  it("não monta uma segunda árvore React do widget", async () => {
    const { view, container } = await setup();

    // A proteção que importa: com `createRoot` renderizando o widget de novo (o
    // caminho do exemplo do Pragmatic), os effects rodariam outra vez — e dois
    // widgets da Home buscam no Mercado Livre no effect.
    assert.equal(mounts, 1, "o clone não executa nada");
    container.remove();
    view.unmount();
  });

  it("o card original continua no lugar", async () => {
    const { view, source, container } = await setup();

    assert.ok(
      view.container.contains(source),
      "é cópia, não mudança de pai — mover o nó remontaria o widget",
    );
    container.remove();
    view.unmount();
  });

  it("leva o valor vivo dos campos", async () => {
    const { view, container } = await setup();

    assert.equal(container.querySelector("textarea")?.value, "comprar caixa");
    assert.equal(container.querySelector("input")?.checked, true);
    container.remove();
    view.unmount();
  });

  it("não duplica o `data-widget-id` no documento", async () => {
    const { view, container } = await setup();

    assert.equal(container.querySelector("[data-widget-id]"), null);
    assert.equal(document.querySelectorAll('[data-widget-id="notas"]').length, 1);
    container.remove();
    view.unmount();
  });
});
