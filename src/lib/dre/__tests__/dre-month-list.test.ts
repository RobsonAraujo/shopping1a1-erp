import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRE_MONTH_LIST_SHORT_MAX,
  formatDreMonthList,
  singleForeignYear,
  type DreMonthRef,
} from "@/lib/dre/dre-month-list";

const YEAR = 2026;

function m(month: number, year = YEAR): DreMonthRef {
  return { year, month };
}

describe("formatDreMonthList", () => {
  it("mês do ano corrente sai sem o ano", () => {
    // Pôr o ano em tudo polui o pill, que é de uma linha.
    assert.equal(formatDreMonthList([m(2)], { currentYear: YEAR }).full, "fev.");
  });

  it("mês de outro ano SEMPRE leva o ano", () => {
    // É o requisito central: a leitura de pendências não filtra por ano, então
    // "dez." sozinho leria como dezembro deste ano.
    assert.equal(
      formatDreMonthList([m(12, 2025)], { currentYear: YEAR }).full,
      "dez./2025",
    );
  });

  it("junta em pt-BR: 1, 2 e 3 itens", () => {
    const of = (refs: DreMonthRef[]) =>
      formatDreMonthList(refs, { currentYear: YEAR }).full;
    assert.equal(of([m(2)]), "fev.");
    assert.equal(of([m(2), m(3)]), "fev. e mar.");
    assert.equal(of([m(2), m(3), m(4)]), "fev., mar. e abr.");
  });

  it("corta no máximo e conta o resto", () => {
    const months = [m(12, 2025), m(1), m(2), m(3), m(4), m(5), m(6)];
    const text = formatDreMonthList(months, { currentYear: YEAR, max: 3 });

    assert.equal(text.short, "dez./2025, jan., fev. e +4");
    assert.equal(text.overflow, 4);
    assert.equal(
      text.full,
      "dez./2025, jan., fev., mar., abr., mai. e jun.",
      "o completo não é cortado",
    );
  });

  it("sem corte, `short` é igual ao `full`", () => {
    const text = formatDreMonthList([m(2), m(3)], { currentYear: YEAR });
    assert.equal(text.short, text.full);
    assert.equal(text.overflow, 0);
  });

  it("usa DRE_MONTH_LIST_SHORT_MAX quando não passam `max`", () => {
    const months = Array.from({ length: DRE_MONTH_LIST_SHORT_MAX + 2 }, (_, i) =>
      m(i + 1),
    );
    assert.equal(formatDreMonthList(months, { currentYear: YEAR }).overflow, 2);
  });

  it("ordena a entrada, sem confiar na ordem do caller", () => {
    const text = formatDreMonthList([m(3), m(1), m(12, 2025)], {
      currentYear: YEAR,
    });
    assert.equal(text.full, "dez./2025, jan. e mar.");
  });

  it("deduplica (ano, mês) repetido", () => {
    // A invariante de 1 pendente por mês é do banco; a função é compartilhada e
    // não pode produzir "fev. e fev." se um caller novo repetir.
    const text = formatDreMonthList([m(2), m(2), m(3)], { currentYear: YEAR });
    assert.equal(text.full, "fev. e mar.");
  });

  it("lista vazia devolve strings vazias", () => {
    // É o contrato que os callers usam pra não renderizar "Esperando
    // confirmação:" pendurado, sem nada depois.
    assert.deepEqual(formatDreMonthList([], { currentYear: YEAR }), {
      short: "",
      full: "",
      overflow: 0,
    });
  });

  it("nunca produz ponto duplicado", () => {
    // Os rótulos já terminam em ponto; a função não pode acrescentar outro.
    const text = formatDreMonthList([m(2), m(3)], { currentYear: YEAR });
    assert.ok(!text.full.includes(".."), text.full);
    assert.ok(!text.full.endsWith(" ."), text.full);
  });

  it("mês inválido degrada sem lançar", () => {
    // Dado sujo não pode derrubar a Home: `formatDreMonthLabel` devolve o número.
    assert.equal(formatDreMonthList([m(13)], { currentYear: YEAR }).full, "13");
  });
});

describe("singleForeignYear", () => {
  it("devolve o ano quando todos são do mesmo ano, e não é o corrente", () => {
    assert.equal(singleForeignYear([m(11, 2025), m(12, 2025)], YEAR), 2025);
  });

  it("devolve null quando há mistura de anos", () => {
    // Com metade no ano corrente, apontar pro outro ano levaria pra longe da
    // maioria — o destino padrão é melhor.
    assert.equal(singleForeignYear([m(12, 2025), m(2)], YEAR), null);
  });

  it("devolve null quando tudo é do ano corrente", () => {
    assert.equal(singleForeignYear([m(2), m(3)], YEAR), null);
  });

  it("devolve null para lista vazia", () => {
    assert.equal(singleForeignYear([], YEAR), null);
  });
});
