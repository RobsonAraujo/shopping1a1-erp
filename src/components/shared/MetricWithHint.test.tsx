import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MetricWithHint } from "./MetricWithHint";

function renderIntoDocument(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("MetricWithHint", () => {
  it("renders the metric value alongside a help trigger", () => {
    const { container, unmount } = renderIntoDocument(
      <MetricWithHint content="Como este valor é calculado.">R$ 1.234,56</MetricWithHint>,
    );
    assert.match(container.textContent ?? "", /R\$ 1\.234,56/);
    const trigger = container.querySelector('button[aria-label="Ver detalhes do cálculo"]');
    assert.ok(trigger, "expected the help trigger button to render");
    unmount();
  });
});
