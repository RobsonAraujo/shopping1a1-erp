import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { toast } from "sonner";
import { act, renderIntoDocument, waitFor } from "@/test-setup/render";
import { MonthlyTaxReportClient } from "@/components/relatorio-tributario/MonthlyTaxReportClient";
import type {
  TaxReportPayload,
  TaxReportScreenStatus,
} from "@/lib/tax-report/types";

const originalFetch = globalThis.fetch;
const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

function report(month: number, revenue: number): TaxReportPayload {
  return {
    year: 2026,
    month,
    consolidado: {
      faturamento: revenue,
      pisCofinsLiquido: 0,
      icmsDifalTotal: 0,
      impostoOperacionalTotal: 0,
      cbsIbsInformativoTotal: 0,
      margemOperacional: 0,
      transacoesIncluidas: 0,
      transacoesExcluidas: 0,
      transacoesSemBillingInfo: 0,
    },
    porSku: [],
    overrides: {},
    meta: {
      geradoEm: "2026-11-03T10:00:00.000Z",
      pedidosProcessados: 10,
      linhasProcessadas: 10,
      semBillingInfo: 0,
      duracaoMs: 0,
      taxRegime: "LUCRO_REAL",
      originUf: "SP",
    },
  };
}

const STATUS: TaxReportScreenStatus = {
  saved: { tax: 0, revenue: 0, generatedAt: "2026-11-03T10:00:00.000Z" },
  unsavedRecalc: false,
  staleness: {
    completeness: "closed",
    reasons: [],
    monthCloseIso: "2026-11-01T03:00:00.000Z",
    ordersFetchedAtIso: "2026-11-03T10:00:00.000Z",
  },
  dre: null,
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const reportResponse = (month: number, revenue: number) =>
  jsonResponse({ ...report(month, revenue), reportStatus: STATUS });

function sseResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

/**
 * Cada GET do relatório fica pendente até o teste responder, na ordem que
 * quiser. Respeita `signal` como o `fetch` real: abortar rejeita a promessa.
 */
function stubFetch(postResponse?: () => Response) {
  const reportRequests: Array<{
    url: string;
    signal: AbortSignal | null | undefined;
    respond: (response: Response) => void;
  }> = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("fixed-cost-items")) {
      return Promise.resolve(jsonResponse({ items: [] }));
    }
    if (init?.method === "POST") {
      return Promise.resolve(postResponse!());
    }
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
      reportRequests.push({ url, signal: init?.signal, respond: resolve });
    });
  }) as typeof fetch;
  return reportRequests;
}

function renderClient() {
  return renderIntoDocument(
    <MonthlyTaxReportClient
      initialYear={2026}
      initialMonth={10}
      initialCompanyTaxRegime="LUCRO_REAL"
      initialFixedCostItems={[]}
      initialReport={report(10, 379925.35)}
      initialReportStatus={STATUS}
    />,
  );
}

async function selectMonth(name: string) {
  const trigger = document.getElementById("tax-report-month");
  assert.ok(trigger, "select de mês não encontrado");
  act(() => {
    trigger.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  let option: HTMLElement | undefined;
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (el) => el.textContent === name,
    );
    assert.ok(option, `opção ${name} não encontrada`);
  });
  act(() => option!.click());
}

const clickRecalculate = (container: HTMLElement) => {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Recalcular",
  );
  assert.ok(button, "botão Recalcular não encontrado");
  act(() => button.click());
};

const skeleton = (container: HTMLElement) =>
  container.querySelector('[role="status"][aria-busy="true"]');

const respond = async (
  request: { respond: (response: Response) => void },
  response: Response,
) => {
  await act(async () => {
    request.respond(response);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

beforeEach(() => {
  // O Select do Radix alinha a opção marcada ao abrir; o jsdom não implementa.
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  mock.restoreAll();
});

describe("MonthlyTaxReportClient — troca de mês", () => {
  it("replaces the old month's numbers with a skeleton until the new month arrives", async () => {
    const requests = stubFetch();
    const view = renderClient();
    assert.match(view.container.textContent ?? "", /379\.925,35/);
    assert.equal(skeleton(view.container), null);

    await selectMonth("Setembro");

    assert.match(requests[0].url, /year=2026&month=9/);
    assert.match(skeleton(view.container)?.textContent ?? "", /Carregando setembro\/2026…/);
    assert.doesNotMatch(view.container.textContent ?? "", /379\.925,35/);

    await respond(requests[0], reportResponse(9, 174226.49));

    await waitFor(() => {
      assert.equal(skeleton(view.container), null);
      assert.match(view.container.textContent ?? "", /174\.226,49/);
    });
    view.unmount();
  });

  it("ignores a late response from a month the user already left", async () => {
    const requests = stubFetch();
    const view = renderClient();

    await selectMonth("Setembro");
    await selectMonth("Agosto");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].signal?.aborted, true);

    // Abortar setembro não pode encerrar o carregamento de agosto.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(skeleton(view.container)?.textContent ?? "", /Carregando agosto\/2026…/);
    assert.equal(view.container.querySelector('[role="alert"]'), null);

    await respond(requests[1], reportResponse(8, 177729.06));
    await respond(requests[0], reportResponse(9, 174226.49));

    await waitFor(() => assert.equal(skeleton(view.container), null));
    assert.match(view.container.textContent ?? "", /177\.729,06/);
    assert.doesNotMatch(view.container.textContent ?? "", /174\.226,49/);
    view.unmount();
  });
});

describe("MonthlyTaxReportClient — recálculo", () => {
  it("leaves 'Salvando' as soon as the server confirms, then confirms the unchanged revenue", async () => {
    const success = mock.method(toast, "success", () => "toast-id");
    const requests = stubFetch(() =>
      sseResponse([
        { type: "progress", phase: "save", message: "Salvando o relatório (10 vendas)…" },
        { type: "complete", saved: { revenue: 379925.35, orders: 10 } },
      ]),
    );
    const view = renderClient();

    clickRecalculate(view.container);

    await waitFor(() => {
      assert.match(
        document.body.textContent ?? "",
        /Relatório salvo\. Carregando os novos números…/,
      );
      assert.equal(requests.length, 1);
    });
    // O overlay cobre esse carregamento: nada de skeleton por baixo.
    assert.equal(skeleton(view.container), null);
    assert.equal(success.mock.callCount(), 0);

    await respond(requests[0], reportResponse(10, 379925.35));

    await waitFor(() => {
      assert.equal(document.querySelector('[role="alertdialog"]'), null);
      assert.equal(success.mock.callCount(), 1);
    });
    assert.match(
      String(success.mock.calls[0].arguments[0]),
      /^Outubro recalculado e salvo\. O faturamento não mudou: /,
    );
    assert.equal(view.container.querySelector('[role="alert"]'), null);
    view.unmount();
  });

  it("warns and shows what is saved when the stream closes without a final event", async () => {
    const requests = stubFetch(() =>
      sseResponse([{ type: "progress", phase: "save", message: "Salvando…" }]),
    );
    const view = renderClient();

    clickRecalculate(view.container);

    await waitFor(() => assert.equal(requests.length, 1));
    await respond(requests[0], reportResponse(10, 379925.35));

    await waitFor(() => {
      const alert = view.container.querySelector('[role="alert"]');
      assert.match(alert?.textContent ?? "", /Não foi possível recalcular o relatório/);
      assert.match(alert?.textContent ?? "", /interrompido antes da confirmação do servidor/);
    });
    assert.match(view.container.textContent ?? "", /379\.925,35/);
    view.unmount();
  });

  it("names the recalculation in the error title when the server reports a failure", async () => {
    const requests = stubFetch(() =>
      sseResponse([{ type: "error", message: "Falhou no Mercado Livre" }]),
    );
    const view = renderClient();

    clickRecalculate(view.container);

    await waitFor(() => {
      const alert = view.container.querySelector('[role="alert"]');
      assert.match(alert?.textContent ?? "", /Não foi possível recalcular o relatório/);
      assert.match(alert?.textContent ?? "", /Falhou no Mercado Livre/);
    });
    assert.equal(requests.length, 0);
    view.unmount();
  });
});
