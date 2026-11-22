import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_ACCOUNT_NAV_GROUP,
  DASHBOARD_DROPDOWN_NAV_GROUPS,
  DASHBOARD_MOBILE_TAB_ITEMS,
  DASHBOARD_NAV_GROUPS,
  DASHBOARD_TOP_NAV_ITEMS,
  getAllDashboardNavItems,
  getDashboardNavSections,
  isDashboardNavActive,
  isDashboardNavGroupActive,
  isDashboardNavItemActive,
} from "../dashboard-nav";

describe("isDashboardNavActive", () => {
  it("treats /dashboard as exact-match only", () => {
    assert.equal(isDashboardNavActive("/dashboard", "/dashboard"), true);
    assert.equal(isDashboardNavActive("/dashboard/produtos", "/dashboard"), false);
  });

  it("treats other hrefs as prefix matches", () => {
    assert.equal(
      isDashboardNavActive("/dashboard/produtos", "/dashboard/produtos"),
      true,
    );
    assert.equal(
      isDashboardNavActive("/dashboard/produtos/MLB1", "/dashboard/produtos"),
      true,
    );
    assert.equal(
      isDashboardNavActive("/dashboard/produtos-antigos", "/dashboard/produtos"),
      false,
    );
  });
});

describe("isDashboardNavItemActive", () => {
  it("also matches declared matchHrefs (tributário redirect)", () => {
    const item = DASHBOARD_NAV_GROUPS.flatMap((g) => g.items).find(
      (entry) => entry.href === "/dashboard/tributario",
    );
    assert.ok(item);
    assert.equal(
      isDashboardNavItemActive("/dashboard/relatorio-tributario", item),
      true,
    );
    assert.equal(
      isDashboardNavItemActive("/dashboard/simples-nacional", item),
      true,
    );
    assert.equal(isDashboardNavItemActive("/dashboard/dre", item), false);
  });
});

describe("isDashboardNavGroupActive / getAllDashboardNavItems", () => {
  it("marks a group active when any of its items match", () => {
    const financeiro = DASHBOARD_NAV_GROUPS.find((g) => g.id === "financeiro");
    assert.ok(financeiro);
    assert.equal(isDashboardNavGroupActive("/dashboard/dre", financeiro), true);
    assert.equal(
      isDashboardNavGroupActive("/dashboard/produtos", financeiro),
      false,
    );
  });

  it("keeps Lucratividade in Financeiro, right after DRE", () => {
    const financeiro = DASHBOARD_NAV_GROUPS.find((g) => g.id === "financeiro");
    assert.ok(financeiro);
    const hrefs = financeiro.items.map((item) => item.href);
    assert.equal(hrefs[hrefs.indexOf("/dashboard/dre") + 1], "/dashboard/lucratividade");
    assert.equal(
      isDashboardNavGroupActive("/dashboard/lucratividade", financeiro),
      true,
    );
    const analises = DASHBOARD_NAV_GROUPS.find((g) => g.id === "analises");
    assert.ok(analises);
    assert.equal(
      analises.items.some((item) => item.href === "/dashboard/lucratividade"),
      false,
    );
  });

  it("puts the Calculadora in Financeiro, right after Lucratividade", () => {
    const financeiro = DASHBOARD_NAV_GROUPS.find((g) => g.id === "financeiro");
    assert.ok(financeiro);
    const hrefs = financeiro.items.map((item) => item.href);
    assert.equal(
      hrefs[hrefs.indexOf("/dashboard/lucratividade") + 1],
      "/dashboard/calculadora",
    );
    assert.equal(isDashboardNavGroupActive("/dashboard/calculadora", financeiro), true);
  });

  it("lists every nav item once, in display order", () => {
    const items = getAllDashboardNavItems();
    const hrefs = items.map((item) => item.href);
    assert.equal(hrefs[0], "/dashboard");
    assert.ok(hrefs.includes("/dashboard/produtos"));
    assert.equal(new Set(hrefs).size, hrefs.length);
  });
});

describe("bar layout", () => {
  it("keeps Início and Ações do dia as the loose links, in that order", () => {
    assert.deepEqual(
      DASHBOARD_TOP_NAV_ITEMS.map((item) => item.href),
      ["/dashboard", "/dashboard/acoes"],
    );
    assert.equal(DASHBOARD_TOP_NAV_ITEMS[1].label, "Ações do dia");
  });

  it("has three menus in the bar; Configurações goes to the account menu", () => {
    assert.deepEqual(
      DASHBOARD_DROPDOWN_NAV_GROUPS.map((group) => group.id),
      ["operacao", "analises", "financeiro"],
    );
    assert.equal(DASHBOARD_ACCOUNT_NAV_GROUP.id, "configuracoes");
    assert.ok(
      getAllDashboardNavItems().some(
        (item) => item.href === "/dashboard/configuracoes/empresa",
      ),
      "Configurações continua nos atalhos e no menu mobile",
    );
  });

  it("puts Full inside Operação, as its last section", () => {
    const operacao = DASHBOARD_NAV_GROUPS.find((g) => g.id === "operacao");
    assert.ok(operacao);
    const sections = getDashboardNavSections(operacao);
    assert.deepEqual(
      sections.map((section) => section.label),
      ["Cadastros", "Estoque e compras", "Full"],
    );
    assert.deepEqual(
      sections.at(-1)?.items.map((item) => item.href),
      ["/dashboard/operacoes-full", "/dashboard/envios-full"],
    );
    for (const item of sections.at(-1)?.items ?? []) {
      assert.match(item.contextLabel ?? "", /Full$/, "fora do menu o nome diz que é do Full");
    }
  });

  it("groups without sections come back as a single unlabeled block", () => {
    const financeiro = DASHBOARD_NAV_GROUPS.find((g) => g.id === "financeiro");
    assert.ok(financeiro);
    const sections = getDashboardNavSections(financeiro);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].label, null);
    assert.equal(sections[0].items.length, financeiro.items.length);
  });
});

describe("DASHBOARD_MOBILE_TAB_ITEMS", () => {
  it("highlights Full on envios-full without marking Início", () => {
    const inicio = DASHBOARD_MOBILE_TAB_ITEMS[0];
    const compras = DASHBOARD_MOBILE_TAB_ITEMS[1];
    const full = DASHBOARD_MOBILE_TAB_ITEMS[2];
    assert.equal(isDashboardNavItemActive("/dashboard", inicio), true);
    assert.equal(isDashboardNavItemActive("/dashboard/compras", inicio), false);
    assert.equal(
      isDashboardNavItemActive("/dashboard/compras/acme", compras),
      true,
    );
    assert.equal(
      isDashboardNavItemActive("/dashboard/envios-full", full),
      true,
    );
    assert.equal(isDashboardNavItemActive("/dashboard/dre", full), false);
  });
});
