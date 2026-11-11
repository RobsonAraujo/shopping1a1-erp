import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument, waitFor } from "@/test-setup/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RotinaAllListingsTable } from "@/components/rotina/RotinaAllListingsTable";
import type { ListingTargetDraft } from "@/components/rotina/RotinaListingTargetForm";
import { buildRotinaView, type RotinaListingRow } from "@/lib/rotina/view";
import { NOW, TZ, listing, settings } from "@/lib/rotina/__tests__/fixtures";

function rowsWith(targets: Map<string, { minMarginPercent: number | null; tacosTargetPercent: number | null }>) {
  return buildRotinaView({
    now: NOW,
    timeZone: TZ,
    settings: settings(),
    health: [
      listing({
        mlItemId: "OWN1",
        title: "Kit Escova",
        imageUrl: null,
        floorAfterAdsPrice: 104.5,
        floorMcPrice: 99.8,
      }),
      listing({
        mlItemId: "OWN2",
        title: "Mouse W",
        imageUrl: null,
        floorAfterAdsPrice: 50,
        floorMcPrice: 48,
      }),
    ],
    catalogLive: [],
    targets,
    states: [],
    lastRun: null,
    lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
  }).listings;
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("RotinaAllListingsTable", () => {
  it("lets any listing get its own target, even without a task today", async () => {
    const rows = rowsWith(new Map([["OWN1", { minMarginPercent: 5, tacosTargetPercent: null }]]));
    const onSaveTarget = mock.fn<
      (row: RotinaListingRow, draft: ListingTargetDraft) => Promise<boolean>
    >(async () => true);
    const rendered = renderIntoDocument(
      <TooltipProvider>
        <RotinaAllListingsTable
          rows={rows}
          segment="all"
          timeZone={TZ}
          busy={false}
          onSaveTarget={onSaveTarget}
        />
      </TooltipProvider>,
    );
    cleanup = rendered.unmount;

    // A linha com meta própria se distingue: na coluna Mínimo e no botão.
    assert.match(rendered.container.textContent ?? "", /p\/ 5% · meta própria/);
    const own = rendered.container.querySelector('button[aria-label="Meta de Kit Escova"]');
    const plain = rendered.container.querySelector('button[aria-label="Meta de Mouse W"]');
    assert.ok(own && plain);
    assert.match(own.className, /bg-\[var\(--primary\)\]\/10/);
    assert.doesNotMatch(plain.className, /bg-\[var\(--primary\)\]\/10/);

    click(plain);
    const formSelector = "[data-radix-popper-content-wrapper] form";
    await waitFor(() => {
      assert.ok(document.querySelector(formSelector), "o formulário de meta não abriu");
    });
    const form = document.querySelector(formSelector) as HTMLFormElement;
    const [margin, tacos] = [...form.querySelectorAll("input")] as HTMLInputElement[];
    // Sem meta própria: campos vazios, padrão do segmento no placeholder.
    assert.equal(margin.value, "");
    assert.match(margin.placeholder, /Padrão: 2%/);
    assert.equal(tacos.value, "");

    type(margin, "7,5");
    const save = [...form.querySelectorAll("button")].find((button) => button.textContent === "Salvar");
    assert.ok(save);
    await act(async () => {
      save.click();
    });

    assert.equal(onSaveTarget.mock.callCount(), 1);
    const [row, draft] = onSaveTarget.mock.calls[0].arguments;
    assert.equal(row.mlItemId, "OWN2");
    assert.deepEqual(draft, { minMarginPercent: 7.5, tacosTargetPercent: null });
  });
});
