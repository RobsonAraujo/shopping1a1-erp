import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRAZILIAN_STATE_CATALOG,
  getMlTruncatedStateIdLookup,
  normalizeUf,
  resolveUfDestino,
  ufFromStateCode,
  ufFromStateName,
} from "@/lib/tax-report/brazilian-ufs";
import { parseUfFromBilling } from "@/lib/tax-report/ml/billing-info-client";

describe("brazilian state catalog", () => {
  it("maps every official state name to the correct UF", () => {
    for (const entry of BRAZILIAN_STATE_CATALOG) {
      const primaryName = entry.names[0];
      assert.equal(ufFromStateName(primaryName), entry.uf, primaryName);
    }
  });

  it("maps IBGE codes to UF", () => {
    assert.equal(ufFromStateCode("35"), "SP");
    assert.equal(ufFromStateCode("33"), "RJ");
  });

  it("maps São Paulo truncated ML id Sã", () => {
    assert.equal(getMlTruncatedStateIdLookup()["Sã"], "SP");
    assert.equal(getMlTruncatedStateIdLookup()["SÃ"], "SP");
    assert.equal(resolveUfDestino("Sã"), "SP");
  });
});

describe("parseUfFromBilling", () => {
  it("uses state id when it is a 2-letter UF", () => {
    assert.equal(
      parseUfFromBilling({
        buyer: { billing_info: { address: { state: { id: "SP" } } } },
      }),
      "SP",
    );
  });

  it("parses BR-XX style state ids", () => {
    assert.equal(
      parseUfFromBilling({
        buyer: { billing_info: { address: { state: { id: "BR-RJ" } } } },
      }),
      "RJ",
    );
  });

  it("maps full state name for all catalog states", () => {
    for (const entry of BRAZILIAN_STATE_CATALOG) {
      assert.equal(
        parseUfFromBilling({
          buyer: {
            billing_info: {
              address: { state: { name: entry.names[0] } },
            },
          },
        }),
        entry.uf,
        entry.names[0],
      );
    }
  });

  it("reads STATE_NAME from additional_info", () => {
    assert.equal(
      parseUfFromBilling({
        buyer: {
          billing_info: {
            additional_info: [{ type: "STATE_NAME", value: "Minas Gerais" }],
          },
        },
      }),
      "MG",
    );
  });

  it("reads flat string state", () => {
    assert.equal(
      parseUfFromBilling({
        buyer: { billing_info: { address: { state: "Paraná" } } },
      }),
      "PR",
    );
  });

  it("maps IBGE state code", () => {
    assert.equal(
      parseUfFromBilling({
        buyer: {
          billing_info: {
            address: { state: { code: "35", name: "" } },
          },
        },
      }),
      "SP",
    );
  });

  it("ignores invalid 2-char state id from ML and uses state name", () => {
    assert.equal(normalizeUf("Sã"), null);
    assert.equal(
      parseUfFromBilling({
        buyer: {
          billing_info: {
            address: { state: { id: "Sã", name: "São Paulo" } },
          },
        },
      }),
      "SP",
    );
  });

  it("repairs legacy truncated UF stored in snapshots", () => {
    assert.equal(resolveUfDestino("Sã"), "SP");
    assert.equal(resolveUfDestino("SÃ"), "SP");
  });
});
