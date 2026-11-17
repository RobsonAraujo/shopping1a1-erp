import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, renderIntoDocument, waitFor } from "@/test-setup/render";
import { DemoCalculator } from "@/components/marketing/DemoCalculator";

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  fetchCalls = 0;
  window.history.replaceState(null, "", "/");
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("a demonstração não pode chamar a rede");
  }) as typeof fetch;
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  globalThis.fetch = originalFetch;
});

function visiblePanel(container: HTMLElement) {
  return [...container.querySelectorAll("article")].find(
    (article) => article.style.display !== "none",
  );
}

describe("DemoCalculator (landing)", () => {
  it("opens on a sample listing and simulates in the browser, without the URL or the network", async () => {
    const rendered = renderIntoDocument(
      <DemoCalculator isLoggedIn={false} dashboardHref="/dashboard" />,
    );
    cleanup = rendered.unmount;
    const panel = visiblePanel(rendered.container);
    assert.ok(panel, "a calculadora de exemplo não abriu");
    assert.match(panel.textContent ?? "", /Kit 3 Cabos USB-C/);
    // Sem link para um anúncio que não existe.
    assert.doesNotMatch(panel.textContent ?? "", /Ver no ML/);

    const form = panel.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => assert.match(panel.textContent ?? "", /A R\$\s?84,90/));
    assert.match(panel.textContent ?? "", /Dados de exemplo/);

    // Trocar de anúncio não mexe na URL da landing.
    const other = [...rendered.container.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes("Capa MagSafe iPhone 14"),
    ) as HTMLElement;
    act(() => other.click());
    await waitFor(() =>
      assert.match(visiblePanel(rendered.container)?.textContent ?? "", /Capa MagSafe iPhone 14/),
    );
    assert.equal(window.location.search, "");
    assert.equal(fetchCalls, 0);
  });
});
