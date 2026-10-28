import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, renderHook, waitFor } from "@/test-setup/render";
import { useDreTaxActions } from "@/components/dre/use-dre-tax-actions";
import type { DreYearView } from "@/lib/dre/dre-year-data";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function setup() {
  const loads: number[] = [];
  const errors: Array<string | null> = [];
  const view = renderHook(() =>
    useDreTaxActions({
      year: 2026,
      setData: () => {},
      loadYear: async (year) => {
        loads.push(year);
      },
      setError: (message) => errors.push(message),
      requestSyncMonth: () => {},
    }),
  );
  return { ...view, loads, errors };
}

describe("useDreTaxActions — tela bloqueada durante a ação", () => {
  it("keeps an operation on screen while the DRE tax is being updated, and clears it at the end", async () => {
    let finishRefresh: ((response: Response) => void) | null = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { dryRun?: boolean };
      if (body.dryRun) {
        return Response.json({
          result: { status: "updated", previousTaxErp: -100, taxErp: -80 },
        });
      }
      return new Promise<Response>((resolve) => {
        finishRefresh = resolve;
      });
    }) as typeof fetch;

    const { result, unmount } = setup();
    act(() => result.current.requestTaxAction(9, "refresh"));
    await waitFor(() => assert.equal(result.current.confirmDialogProps.loading, false));
    act(() => result.current.confirmDialogProps.onConfirm());

    await waitFor(() => assert.equal(result.current.taxOperation?.kind, "refresh"));
    assert.ok(result.current.taxBusyMonths.has(9));

    await act(async () => {
      finishRefresh!(
        Response.json({
          result: { status: "updated", previousTaxErp: -100, taxErp: -80 },
          yearView: { year: 2026, months: [] } as unknown as DreYearView,
        }),
      );
    });
    await waitFor(() => assert.equal(result.current.taxOperation, null));
    unmount();
  });

  it("shows the tax report generation progress and lets the user cancel before saving", async () => {
    const encoder = new TextEncoder();
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"type":"progress","phase":"billing","message":"Dados fiscais: 10/100","current":10,"total":100}\n\n',
              ),
            );
            signal?.addEventListener("abort", () => {
              controller.error(new DOMException("Aborted", "AbortError"));
            });
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const { result, unmount, loads } = setup();
    act(() => result.current.requestTaxAction(9, "regenerate_report"));
    act(() => result.current.confirmDialogProps.onConfirm());

    await waitFor(() => {
      const operation = result.current.taxOperation;
      assert.equal(operation?.kind, "regenerate");
      assert.equal(
        operation?.kind === "regenerate" ? operation.progress.current : null,
        10,
      );
    });

    act(() => result.current.cancelTaxOperation());
    await waitFor(() => assert.equal(result.current.taxOperation, null));
    // Recarrega o ano para a tela mostrar exatamente o que ficou no banco.
    assert.deepEqual(loads, [2026]);
    unmount();
  });

  it("walks through several months after a leveling, one at a time", async () => {
    const seen: number[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { month: number; mode?: string };
      if (body.mode === "preview") {
        return Response.json({
          preview: {
            report: { before: { tax: 1, revenue: 10 }, after: { tax: 1, revenue: 10 } },
            dre: { status: "unchanged", previousTaxErp: -1, taxErp: -1 },
          },
        });
      }
      seen.push(body.month);
      return Response.json({ ok: true, dreFollowUp: { status: "unchanged", previousTaxErp: -1, taxErp: -1 } });
    }) as typeof fetch;

    const { result, unmount, loads } = setup();
    act(() => result.current.requestRecomputeReports([2, 1]));
    await waitFor(() => assert.equal(result.current.confirmDialogProps.loading, false));
    act(() => result.current.confirmDialogProps.onConfirm());
    await waitFor(() => assert.equal(result.current.taxOperation, null));
    assert.deepEqual(seen, [1, 2]);
    assert.deepEqual(loads, [2026]);
    unmount();
  });
});
