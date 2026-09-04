import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderIntoDocument } from "@/test-setup/render";
import { MetricWithHint } from "../MetricWithHint";

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
