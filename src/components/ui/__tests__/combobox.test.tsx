import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument, waitFor } from "@/test-setup/render";
import { Combobox } from "../combobox";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../sheet";

const OPTIONS = [
  { value: "", label: "Sem fornecedor" },
  { value: "1", label: "Açúcar Distribuidora" },
  { value: "2", label: "Bravo Importações" },
];

function ComboboxInSheet({
  onValueChange,
}: {
  onValueChange: (value: string) => void;
}) {
  return (
    <Sheet open>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Produto</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Combobox
            id="supplier"
            label="Fornecedor"
            value=""
            onValueChange={onValueChange}
            options={OPTIONS}
            searchPlaceholder="Buscar fornecedor…"
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function openPanel() {
  const trigger = document.querySelector('[role="combobox"]');
  assert.ok(trigger, "gatilho do combobox não renderizou");
  click(trigger!);
  return trigger!;
}

function panelContent() {
  return document.querySelector(
    "[data-radix-popper-content-wrapper] > *",
  ) as HTMLElement | null;
}

describe("Combobox", () => {
  /**
   * Regressão: com cópias duplicadas de `react-dismissable-layer` no
   * node_modules, o Sheet e o Popover ficavam em pilhas de camadas separadas
   * — o Sheet zerava `pointer-events` do body e o Popover não se reativava,
   * deixando a lista visível porém inerte (sem clique e sem digitação).
   */
  it("fica clicável mesmo aberto dentro de um Sheet modal", async () => {
    const { unmount } = renderIntoDocument(<ComboboxInSheet onValueChange={() => {}} />);
    openPanel();

    await waitFor(() => {
      assert.ok(panelContent(), "painel do combobox não abriu");
    });
    assert.equal(
      document.body.style.pointerEvents,
      "none",
      "pré-condição: o Sheet modal desliga os ponteiros do body",
    );
    assert.equal(
      panelContent()?.style.pointerEvents,
      "auto",
      "o painel precisa reativar os ponteiros para receber clique",
    );
    unmount();
  });

  it("mantém o foco na busca dentro do Sheet e filtra sem acento", async () => {
    const { unmount } = renderIntoDocument(<ComboboxInSheet onValueChange={() => {}} />);
    openPanel();

    await waitFor(() => {
      assert.ok(panelContent());
    });
    const search = document.querySelector(
      'input[aria-label="Buscar fornecedor…"]',
    ) as HTMLInputElement | null;
    assert.ok(search, "campo de busca não renderizou");

    await waitFor(() => {
      assert.equal(
        document.activeElement,
        search,
        "o foco precisa ficar na busca, não voltar para o Sheet",
      );
    });

    type(search!, "acucar");
    const options = [...document.querySelectorAll('[role="option"]')].map(
      (o) => o.textContent,
    );
    assert.deepEqual(options, ["Açúcar Distribuidora"]);
    unmount();
  });

  it("seleciona a opção clicada", async () => {
    let selected: string | null = null;
    const { unmount } = renderIntoDocument(
      <ComboboxInSheet onValueChange={(value) => { selected = value; }} />,
    );
    openPanel();
    await waitFor(() => {
      assert.ok(panelContent());
    });

    const option = [...document.querySelectorAll('[role="option"]')].find(
      (o) => o.textContent === "Bravo Importações",
    );
    assert.ok(option, "opção não renderizou");
    click(option!);

    assert.equal(selected, "2");
    unmount();
  });
});
