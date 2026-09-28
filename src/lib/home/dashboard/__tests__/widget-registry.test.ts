import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_DASHBOARD_COLUMN_COUNT,
  HOME_DASHBOARD_GRID_CLASS,
  HOME_WIDGET_CATEGORY_LABEL,
  HOME_WIDGET_CATEGORY_ORDER,
  HOME_WIDGET_DEFINITIONS,
  getHomeWidgetDefinition,
  homeWidgetDataKeysFor,
} from "@/lib/home/dashboard/widget-registry";
import { HOME_WIDGET_DATA_KEYS } from "@/lib/home/dashboard/widget-data-keys";
import { getAllDashboardNavItems } from "@/lib/dashboard-nav";

/**
 * Invariantes do registry. Existem porque adicionar widget é a operação mais
 * repetida desta feature: é aqui que um href digitado errado, um tamanho
 * default fora da lista de suportados ou um p0 que não consegue pintar no
 * primeiro load são pegos — sem isso, cada um desses vira bug silencioso em
 * produção.
 */
describe("registry de widgets da Home", () => {
  it("não tem id repetido", () => {
    const ids = HOME_WIDGET_DEFINITIONS.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("não tem defaultOrder repetido (a ordem inicial precisa ser determinística)", () => {
    const orders = HOME_WIDGET_DEFINITIONS.map((d) => d.defaultOrder);
    assert.equal(new Set(orders).size, orders.length);
  });

  it("toda coluna default existe no layout", () => {
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      assert.ok(
        Number.isInteger(definition.defaultColumn) &&
          definition.defaultColumn >= 0 &&
          definition.defaultColumn < HOME_DASHBOARD_COLUMN_COUNT,
        `${definition.id}: defaultColumn ${definition.defaultColumn} fora do layout`,
      );
    }
  });

  it("a classe do grid casa com a quantidade de colunas", () => {
    // As duas moram juntas justamente pra não divergirem, mas o Tailwind exige
    // a classe literal — então só um teste garante que combinam.
    assert.match(
      HOME_DASHBOARD_GRID_CLASS,
      new RegExp(`md:grid-cols-${HOME_DASHBOARD_COLUMN_COUNT}$`),
    );
  });

  it("todo widget fixado é faixa, e há pelo menos uma faixa", () => {
    const banners = HOME_WIDGET_DEFINITIONS.filter((d) => d.layout === "banner");
    assert.ok(banners.length > 0, "a zona de atenção precisa ser faixa");
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      if (!definition.pinned) continue;
      assert.equal(
        definition.layout,
        "banner",
        `${definition.id}: fixado precisa ser faixa (não entra no arrasto)`,
      );
    }
  });

  it("todo href aponta pra uma rota real do app", () => {
    const navItems = getAllDashboardNavItems();
    const known = new Set<string>();
    for (const item of navItems) {
      known.add(item.href);
      for (const match of item.matchHrefs ?? []) known.add(match);
    }
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      if (!definition.href) continue;
      const path = definition.href.split("?")[0];
      const reachable =
        known.has(path) ||
        [...known].some((navHref) => path.startsWith(`${navHref}/`));
      assert.ok(
        reachable,
        `${definition.id}: href "${definition.href}" não corresponde a nenhuma rota da navegação`,
      );
    }
  });

  it("toda chave de batch existe no contrato de dados", () => {
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      if (definition.source.kind !== "batch") continue;
      assert.ok(
        (HOME_WIDGET_DATA_KEYS as readonly string[]).includes(
          definition.source.dataKey,
        ),
        `${definition.id}: dataKey "${definition.source.dataKey}" desconhecida`,
      );
    }
  });

  it("nenhum widget de batch é p0", () => {
    // p0 precisa pintar no primeiro load, e chave de batch só resolve depois
    // do mount — um p0 de batch seria uma promessa que a arquitetura não cumpre.
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      if (definition.source.kind !== "batch") continue;
      assert.notEqual(
        definition.priority,
        "p0",
        `${definition.id}: widget de batch não pode ser p0`,
      );
    }
  });

  it("nenhum endpoint isolado aparece duas vezes", () => {
    const endpoints = HOME_WIDGET_DEFINITIONS.flatMap((d) =>
      d.source.kind === "isolated" ? [d.source.endpoint] : [],
    );
    assert.equal(new Set(endpoints).size, endpoints.length);
  });

  it("widget fixado nasce visível", () => {
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      if (!definition.pinned) continue;
      assert.equal(
        definition.defaultVisible,
        true,
        `${definition.id}: fixado precisa nascer visível`,
      );
    }
  });

  it("toda categoria usada tem rótulo e posição na ordenação", () => {
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      assert.ok(HOME_WIDGET_CATEGORY_LABEL[definition.category]);
      assert.ok(HOME_WIDGET_CATEGORY_ORDER.includes(definition.category));
    }
  });

  it("o default já é útil sem personalizar nada", () => {
    const visible = HOME_WIDGET_DEFINITIONS.filter((d) => d.defaultVisible);
    assert.ok(visible.length >= 8, "Home default precisa nascer com conteúdo");
    assert.ok(
      visible.some((d) => d.pinned),
      "a zona de atenção precisa estar no default",
    );
  });

  it("getHomeWidgetDefinition devolve null pra id desconhecido", () => {
    assert.equal(getHomeWidgetDefinition("fantasma"), null);
    assert.ok(getHomeWidgetDefinition(HOME_WIDGET_DEFINITIONS[0].id));
  });

  it("homeWidgetDataKeysFor deduplica e mantém ordem estável", () => {
    const batchIds = HOME_WIDGET_DEFINITIONS.filter(
      (d) => d.source.kind === "batch",
    ).map((d) => d.id);

    assert.deepEqual(homeWidgetDataKeysFor([]), []);
    assert.deepEqual(homeWidgetDataKeysFor(["fantasma"]), []);

    const keys = homeWidgetDataKeysFor(batchIds);
    assert.equal(new Set(keys).size, keys.length, "sem duplicata");
    assert.deepEqual(
      homeWidgetDataKeysFor([...batchIds].reverse()),
      keys,
      "a ordem das chaves não pode depender da ordem dos widgets",
    );
  });
});
