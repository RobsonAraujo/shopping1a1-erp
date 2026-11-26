import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { act, renderIntoDocument } from "@/test-setup/render";
import {
  IcmsIncentiveCard,
  IcmsIncentiveNcmNotice,
} from "@/components/produtos/IcmsIncentiveField";
import type { IcmsIncentiveScreenData } from "@/lib/tax-incentives/types";

const products = [
  { mlItemId: "MLB1", sku: "PROD-A", ncm: "8516.31.00", icmsIncentiveExcluded: false },
  { mlItemId: "MLB2", sku: "PROD-B", ncm: "85163100", icmsIncentiveExcluded: false },
  { mlItemId: "MLB3", sku: "PROD-C", ncm: "9999.99.99", icmsIncentiveExcluded: false },
];

function screen(rules: IcmsIncentiveScreenData["rules"] = []): IcmsIncentiveScreenData {
  return {
    rules,
    originUf: "SP",
    internalRatePercent: 18,
    taxRegime: "LUCRO_REAL",
  };
}

const rule = {
  ncm: "85163100",
  ratePercent: 12,
  appliesTo: "all" as const,
  validFrom: null,
  validTo: null,
  note: null,
  updatedAt: "2026-11-26T00:00:00.000Z",
  productCount: 2,
};

function cardProps(overrides: Partial<Parameters<typeof IcmsIncentiveCard>[0]> = {}) {
  return {
    ncm: "8516.31.00",
    mlItemId: "MLB1",
    excluded: false,
    onExcludedChange: () => {},
    purchaseIcmsPercent: 12,
    hasIcmsSt: false,
    products,
    screen: screen(),
    onSaved: () => {},
    onDeleted: () => {},
    ...overrides,
  };
}

function switchIn(container: HTMLElement) {
  const el = container.querySelector<HTMLButtonElement>('button[role="switch"]');
  assert.ok(el, "expected the incentive switch");
  return el;
}

describe("IcmsIncentiveCard", () => {
  it("fica desabilitado enquanto o NCM não tem 8 dígitos", () => {
    const { container, unmount } = renderIntoDocument(
      <IcmsIncentiveCard {...cardProps({ ncm: "8516" })} />,
    );
    assert.equal(switchIn(container).disabled, true);
    assert.match(container.textContent ?? "", /Preencha o NCM/);
    unmount();
  });

  it("ligado e com o resumo quando o NCM tem incentivo", () => {
    const { container, unmount } = renderIntoDocument(
      <IcmsIncentiveCard {...cardProps({ screen: screen([rule]) })} />,
    );
    assert.equal(switchIn(container).getAttribute("aria-checked"), "true");
    assert.match(container.textContent ?? "", /ICMS de 12,00%/);
    assert.match(container.textContent ?? "", /no lugar de 18,00% da tabela/);
    unmount();
  });

  it("desligado quando o produto está marcado 'não se aplica'", () => {
    const { container, unmount } = renderIntoDocument(
      <IcmsIncentiveCard {...cardProps({ screen: screen([rule]), excluded: true })} />,
    );
    assert.equal(switchIn(container).getAttribute("aria-checked"), "false");
    assert.match(container.textContent ?? "", /não se aplica/);
    unmount();
  });

  it("ligar sem regra abre a tela do incentivo com os outros produtos do mesmo NCM", () => {
    const { container, unmount } = renderIntoDocument(<IcmsIncentiveCard {...cardProps()} />);
    act(() => {
      switchIn(container).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    const body = document.body.textContent ?? "";
    assert.match(body, /Incentivo fiscal — NCM 8516\.31\.00/);
    assert.match(body, /Outros produtos com este NCM \(1\)/);
    assert.match(body, /PROD-B/);
    assert.doesNotMatch(body, /PROD-C/);
    unmount();
  });
});

describe("IcmsIncentiveCard — Esc", () => {
  it("Esc na tela do incentivo não chega ao listener do formulário do produto", () => {
    let formClosed = false;
    const onWindowKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") formClosed = true;
    };
    window.addEventListener("keydown", onWindowKey);
    const { container, unmount } = renderIntoDocument(<IcmsIncentiveCard {...cardProps()} />);
    act(() => {
      switchIn(container).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    const input = document.body.querySelector<HTMLInputElement>("#icms-incentive-rate");
    assert.ok(input, "expected the rate field in the incentive screen");
    act(() => {
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(formClosed, false);
    window.removeEventListener("keydown", onWindowKey);
    unmount();
  });
});

describe("IcmsIncentiveNcmNotice", () => {
  it("avisa que o NCM digitado já tem incentivo", () => {
    const { container, unmount } = renderIntoDocument(
      <IcmsIncentiveNcmNotice
        ncm="85163100"
        mlItemId="MLB-NOVO"
        excluded={false}
        onExcludedChange={() => {}}
        products={products}
        screen={screen([rule])}
      />,
    );
    const text = container.textContent ?? "";
    assert.match(text, /Este NCM já tem incentivo fiscal/);
    assert.match(text, /2 outros produtos com esse NCM/);
    assert.match(text, /Não vale para este produto/);
    unmount();
  });

  it("não aparece sem regra nem no Simples", () => {
    const semRegra = renderIntoDocument(
      <IcmsIncentiveNcmNotice
        ncm="85163100"
        mlItemId="MLB-NOVO"
        excluded={false}
        onExcludedChange={() => {}}
        products={products}
        screen={screen()}
      />,
    );
    assert.equal(semRegra.container.textContent, "");
    semRegra.unmount();

    const simples = renderIntoDocument(
      <IcmsIncentiveNcmNotice
        ncm="85163100"
        mlItemId="MLB-NOVO"
        excluded={false}
        onExcludedChange={() => {}}
        products={products}
        screen={{ ...screen([rule]), taxRegime: "SIMPLES" }}
      />,
    );
    assert.equal(simples.container.textContent, "");
    simples.unmount();
  });
});
