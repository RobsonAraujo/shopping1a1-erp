import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMonthAlertMessages } from "@/components/dre/DreYearTableShared";
import type { DreMonthView } from "@/lib/dre/dre-year-data";

/**
 * Conjunto DOM e não o puro porque `getMonthAlertMessages` mora num arquivo
 * `"use client"` com JSX — só o runner de DOM alcança.
 *
 * `DreMonthView` tem ~45 campos e a função lê 6; o resto é ruído aqui, por isso
 * o cast. Se a função passar a ler outro campo, o teste falha alto em vez de
 * passar por acidente.
 */
const NO_RECONCILIATION: DreMonthView["reconciliation"] = {
  status: "none",
  reconciledAt: null,
  fileName: null,
  lineKeys: [],
  reviewImportId: null,
};

function month(overrides: Partial<DreMonthView> = {}): DreMonthView {
  return {
    month: 2,
    label: "fev.",
    isPartial: false,
    billingSource: null,
    syncedAt: "2026-03-01T00:00:00.000Z",
    syncWarnings: [],
    reconciliation: NO_RECONCILIATION,
    levelingChangedAfterSync: false,
    ...overrides,
  } as DreMonthView;
}

const REVIEW: DreMonthView["reconciliation"] = {
  ...NO_RECONCILIATION,
  status: "review",
  reviewImportId: "imp_1",
};

describe("getMonthAlertMessages", () => {
  it("mês limpo não gera aviso nenhum", () => {
    assert.deepEqual(getMonthAlertMessages(month()), []);
  });

  it("mês conciliado não gera aviso", () => {
    assert.deepEqual(
      getMonthAlertMessages(
        month({
          reconciliation: {
            ...NO_RECONCILIATION,
            status: "reconciled",
            reconciledAt: "2026-03-05T00:00:00.000Z",
          },
        }),
      ),
      [],
    );
  });

  it("conciliação salva pelo fluxo antigo vira aviso de revisão", () => {
    // Vem do servidor (qualquer sessão): o banner antigo dependia do estado da
    // própria aba e a pendência de outra aba era invisível aqui.
    const messages = getMonthAlertMessages(month({ reconciliation: REVIEW }));
    assert.equal(messages.length, 1);
    assert.match(messages[0], /revisar/i);
  });

  it("nivelamento alterado depois do sync vira aviso", () => {
    const messages = getMonthAlertMessages(
      month({ levelingChangedAfterSync: true }),
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Nivelamento/);
  });

  it("os acionáveis vêm primeiro, e não apagam os outros avisos", () => {
    // Ordem por acionabilidade: revisão e nivelamento pedem ação do usuário; o
    // resto é informativo. Num mês com 8 avisos, enterrar a única acionável no
    // meio da lista é o mesmo que não mostrar.
    const messages = getMonthAlertMessages(
      month({
        isPartial: true,
        reconciliation: REVIEW,
        levelingChangedAfterSync: true,
        syncWarnings: ["Aviso do sync."],
      }),
    );
    assert.equal(messages.length, 4);
    assert.match(messages[0], /Conciliação/);
    assert.match(messages[1], /Nivelamento/);
    assert.match(messages[2], /Período parcial/);
    assert.equal(messages[3], "Aviso do sync.", "os do sync ficam por último");
  });
});
