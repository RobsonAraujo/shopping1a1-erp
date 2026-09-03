import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Breadcrumbs } from "./Breadcrumbs";

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

describe("Breadcrumbs", () => {
  it("renders every item's label in the desktop trail", () => {
    const { container, unmount } = renderIntoDocument(
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Produtos", href: "/dashboard/produtos" },
          { label: "Item 123" },
        ]}
      />,
    );
    const trailLabels = Array.from(container.querySelectorAll("ol li")).map(
      (li) => li.textContent,
    );
    assert.deepEqual(trailLabels, ["Dashboard", "Produtos", "Item 123"]);
    unmount();
  });

  it("marks only the last item as the current page", () => {
    const { container, unmount } = renderIntoDocument(
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Item 123" }]}
      />,
    );
    const current = container.querySelector('[aria-current="page"]');
    assert.equal(current?.textContent, "Item 123");
    unmount();
  });

  it("does not render a link for the current (last) item", () => {
    const { container, unmount } = renderIntoDocument(
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Item 123" }]}
      />,
    );
    const links = Array.from(container.querySelectorAll("ol a")).map(
      (a) => a.textContent,
    );
    assert.deepEqual(links, ["Dashboard"]);
    unmount();
  });

  it("omits the mobile back link when there is no parent", () => {
    const { container, unmount } = renderIntoDocument(
      <Breadcrumbs items={[{ label: "Dashboard" }]} />,
    );
    const mobileSection = container.querySelector(".sm\\:hidden");
    assert.equal(mobileSection?.querySelector("a"), null);
    unmount();
  });
});
