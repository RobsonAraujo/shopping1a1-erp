import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatApiErrorMessage, readApiError } from "../api-client-error";

function fakeResponse(body: unknown, { throwOnJson = false } = {}): Response {
  return {
    json: async () => {
      if (throwOnJson) throw new Error("not json");
      return body;
    },
  } as unknown as Response;
}

describe("formatApiErrorMessage", () => {
  it("maps a known error code to its pt-BR message", () => {
    assert.equal(
      formatApiErrorMessage("products_load_failed"),
      "Não foi possível carregar os produtos.",
    );
  });

  it("returns the input unchanged for an unmapped code", () => {
    assert.equal(formatApiErrorMessage("some_unknown_code"), "some_unknown_code");
  });

  it("maps the shared 'Unauthorized' and 'Invalid JSON' messages", () => {
    assert.equal(formatApiErrorMessage("Unauthorized"), "Sessão expirada. Entre novamente.");
    assert.equal(
      formatApiErrorMessage("Invalid JSON"),
      "Dados inválidos enviados ao servidor.",
    );
  });
});

describe("readApiError", () => {
  it("uses the response body's error field, mapped to a friendly message", () => {
    const res = fakeResponse({ error: "products_load_failed" });
    return readApiError(res, "fallback_code").then((msg) => {
      assert.equal(msg, "Não foi possível carregar os produtos.");
    });
  });

  it("passes through an unmapped error field unchanged", () => {
    const res = fakeResponse({ error: "algo deu errado no servidor" });
    return readApiError(res, "fallback_code").then((msg) => {
      assert.equal(msg, "algo deu errado no servidor");
    });
  });

  it("falls back when the body has no usable error field", () => {
    const res = fakeResponse({});
    return readApiError(res, "products_load_failed").then((msg) => {
      assert.equal(msg, "Não foi possível carregar os produtos.");
    });
  });

  it("falls back when the body is blank/non-JSON", () => {
    const res = fakeResponse(null, { throwOnJson: true });
    return readApiError(res, "products_load_failed").then((msg) => {
      assert.equal(msg, "Não foi possível carregar os produtos.");
    });
  });

  it("falls back when the error field is only whitespace", () => {
    const res = fakeResponse({ error: "   " });
    return readApiError(res, "products_load_failed").then((msg) => {
      assert.equal(msg, "Não foi possível carregar os produtos.");
    });
  });
});
