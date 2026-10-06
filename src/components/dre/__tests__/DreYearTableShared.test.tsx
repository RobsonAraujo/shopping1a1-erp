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
function month(overrides: Partial<DreMonthView> = {}): DreMonthView {
  return {
    month: 2,
    label: "fev.",
    isPartial: false,
    billingSource: null,
    syncedAt: "2026-03-01T00:00:00.000Z",
    syncWarnings: [],
    pendingReconciliationImportId: null,
    pendingReconciliationApplied: false,
    ...overrides,
  } as DreMonthView;
}

describe("getMonthAlertMessages", () => {
  it("mês limpo não gera aviso nenhum", () => {
    assert.deepEqual(getMonthAlertMessages(month()), []);
  });

  it("conciliação importada e não aplicada vira aviso", () => {
    // Regressão do beco sem saída: a Home dizia "conciliação pendente em fev." e
    // esta tela não marcava nada, porque o banner do `DreClient` exige estado da
    // própria sessão. Pendência de outra aba era invisível aqui.
    const messages = getMonthAlertMessages(
      month({ pendingReconciliationImportId: "imp_1" }),
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0], /esperando confirmação/i);
  });

  it("conciliação já aplicada tem redação própria", () => {
    const messages = getMonthAlertMessages(
      month({
        pendingReconciliationImportId: "imp_1",
        pendingReconciliationApplied: true,
      }),
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0], /aplicada e não salva/i);
  });

  it("a conciliação vem primeiro, e não apaga os outros avisos", () => {
    // Ordem por acionabilidade: a conciliação é a única coisa aqui que pede uma
    // decisão do usuário; o resto é informativo. Num mês com 8 avisos — e nesta
    // base todos têm —, enterrar a única acionável no meio da lista é o mesmo
    // que não mostrar.
    const messages = getMonthAlertMessages(
      month({
        isPartial: true,
        pendingReconciliationImportId: "imp_1",
        syncWarnings: ["Aviso do sync."],
      }),
    );
    assert.equal(messages.length, 3);
    assert.match(messages[0], /Conciliação/);
    assert.match(messages[1], /Período parcial/);
    assert.equal(messages[2], "Aviso do sync.", "os do sync ficam por último");
  });
});
