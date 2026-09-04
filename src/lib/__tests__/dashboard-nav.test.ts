import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_NAV_GROUPS,
  getAllDashboardNavItems,
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

  it("lists every nav item once, in display order", () => {
    const items = getAllDashboardNavItems();
    const hrefs = items.map((item) => item.href);
    assert.equal(hrefs[0], "/dashboard");
    assert.ok(hrefs.includes("/dashboard/produtos"));
    assert.equal(new Set(hrefs).size, hrefs.length);
  });
});
