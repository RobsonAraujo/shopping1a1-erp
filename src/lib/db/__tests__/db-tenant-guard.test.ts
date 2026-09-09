import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasOrganizationFilter,
  requiresOrganizationFilter,
} from "@/lib/db/db-tenant-guard";

describe("requiresOrganizationFilter", () => {
  it("requires the filter for a bulk op on a tenant-scoped model", () => {
    assert.equal(requiresOrganizationFilter("Product", "findMany"), true);
    assert.equal(requiresOrganizationFilter("WarehouseStock", "deleteMany"), true);
    assert.equal(requiresOrganizationFilter("Listing", "count"), true);
    assert.equal(requiresOrganizationFilter("Kit", "aggregate"), true);
    assert.equal(requiresOrganizationFilter("DreCostItem", "groupBy"), true);
    assert.equal(requiresOrganizationFilter("SalesWindowSnapshot", "updateMany"), true);
  });

  it("does not require the filter for a single-record op, even on a scoped model", () => {
    assert.equal(requiresOrganizationFilter("Product", "findUnique"), false);
    assert.equal(requiresOrganizationFilter("Product", "findFirst"), false);
    assert.equal(requiresOrganizationFilter("Product", "update"), false);
    assert.equal(requiresOrganizationFilter("Product", "delete"), false);
    assert.equal(requiresOrganizationFilter("Product", "create"), false);
  });

  it("does not require the filter for a model that isn't tenant-scoped", () => {
    // TaxReportMonthSnapshot/RevenueSimulation são escopados por sellerId de
    // propósito (ver comentário em db-tenant-guard.ts) — não devem exigir
    // organizationId mesmo em operação em lote.
    assert.equal(requiresOrganizationFilter("TaxReportMonthSnapshot", "findMany"), false);
    assert.equal(requiresOrganizationFilter("RevenueSimulation", "findMany"), false);
    assert.equal(requiresOrganizationFilter("FlexDistanceTier", "findMany"), false);
  });
});

describe("hasOrganizationFilter", () => {
  it("is true when organizationId is present, regardless of value", () => {
    assert.equal(hasOrganizationFilter({ organizationId: "org_1" }), true);
    assert.equal(hasOrganizationFilter({ organizationId: null }), true);
    assert.equal(
      hasOrganizationFilter({ organizationId: "org_1", mlItemId: "MLB1" }),
      true,
    );
  });

  it("is false when organizationId is absent or where is not a usable object", () => {
    assert.equal(hasOrganizationFilter(undefined), false);
    assert.equal(hasOrganizationFilter(null), false);
    assert.equal(hasOrganizationFilter({}), false);
    assert.equal(hasOrganizationFilter({ mlItemId: "MLB1" }), false);
  });
});
