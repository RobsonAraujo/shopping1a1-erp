import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { act, renderIntoDocument } from "@/test-setup/render";
import {
  DifalCollectionField,
  difalCollectionLabel,
} from "@/components/configuracoes/DifalCollectionField";

describe("DifalCollectionField", () => {
  it("mostra a grade de estados só em 'Recolho só em alguns estados', sem a UF da empresa", () => {
    const all = renderIntoDocument(
      <DifalCollectionField mode="all" ufs={[]} originUf="SP" onChange={() => {}} />,
    );
    assert.equal(all.container.querySelector('[role="group"]'), null);
    all.unmount();

    const some = renderIntoDocument(
      <DifalCollectionField mode="some" ufs={["RJ"]} originUf="SP" onChange={() => {}} />,
    );
    const buttons = [...some.container.querySelectorAll<HTMLButtonElement>('[role="group"] button')];
    const labels = buttons.map((b) => b.textContent);
    assert.ok(labels.includes("RJ"));
    assert.ok(!labels.includes("SP"));
    assert.equal(buttons.length, 26);
    assert.equal(buttons.find((b) => b.textContent === "RJ")?.getAttribute("aria-pressed"), "true");
    some.unmount();
  });

  it("marcar um estado devolve a lista nova, em ordem", () => {
    let last: { mode: string; ufs: string[] } | null = null;
    const { container, unmount } = renderIntoDocument(
      <DifalCollectionField
        mode="some"
        ufs={["RJ"]}
        originUf="SP"
        onChange={(next) => {
          last = next;
        }}
      />,
    );
    const mg = [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')].find(
      (b) => b.textContent === "MG",
    );
    assert.ok(mg);
    act(() => {
      mg.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(last, { mode: "some", ufs: ["MG", "RJ"] });
    unmount();
  });

  it("avisa quando 'alguns estados' está sem nenhum estado marcado", () => {
    const { container, unmount } = renderIntoDocument(
      <DifalCollectionField mode="some" ufs={[]} originUf="SP" onChange={() => {}} />,
    );
    assert.match(container.textContent ?? "", /mesmo que "Não recolho"/);
    unmount();
  });
});

describe("difalCollectionLabel", () => {
  it("descreve a configuração", () => {
    assert.equal(difalCollectionLabel(undefined, undefined), "Recolho em todos os estados");
    assert.equal(difalCollectionLabel("none", []), "Não recolho");
    assert.equal(difalCollectionLabel("some", ["RJ", "MG"]), "Recolho só em MG, RJ");
  });
});
