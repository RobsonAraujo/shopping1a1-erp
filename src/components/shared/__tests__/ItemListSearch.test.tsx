import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { ItemListSearch, itemListSearchEmptyMessage } from "../ItemListSearch";

describe("itemListSearchEmptyMessage", () => {
  it("uses the empty-list copy when the query is blank", () => {
    assert.equal(
      itemListSearchEmptyMessage("  "),
      "Nenhum anúncio nesta lista.",
    );
  });

  it("includes the trimmed query when there are no matches", () => {
    assert.equal(
      itemListSearchEmptyMessage("  MLB123  ", "produto"),
      'Nenhum resultado encontrado para "MLB123".',
    );
  });
});

describe("ItemListSearch", () => {
  it("shows the filtered count only while a query is active", () => {
    const { container, rerender, unmount } = renderIntoDocument(
      <ItemListSearch
        value=""
        onChange={() => {}}
        filteredCount={2}
        totalCount={10}
      />,
    );
    assert.equal(container.querySelector("p"), null);

    rerender(
      <ItemListSearch
        value="mlb"
        onChange={() => {}}
        filteredCount={2}
        totalCount={10}
      />,
    );
    assert.match(container.textContent ?? "", /2 de 10 anúncios/);
    unmount();
  });

  it("uses the singular entity label when the list has one item", () => {
    const { container, unmount } = renderIntoDocument(
      <ItemListSearch
        value="a"
        onChange={() => {}}
        filteredCount={1}
        totalCount={1}
        entitySingular="kit"
        entityPlural="kits"
      />,
    );
    assert.match(container.textContent ?? "", /1 de 1 kit/);
    unmount();
  });

  it("clears the query from the clear button", () => {
    const values: string[] = [];
    const { container, unmount } = renderIntoDocument(
      <ItemListSearch value="mlb" onChange={(value) => values.push(value)} />,
    );
    const clear = container.querySelector('button[aria-label="Limpar busca"]');
    assert.ok(clear);
    act(() => {
      clear!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(values, [""]);
    unmount();
  });
});
