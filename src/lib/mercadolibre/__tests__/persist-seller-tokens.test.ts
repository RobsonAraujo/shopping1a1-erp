import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRefreshPlain } from "@/lib/mercadolibre/persist-seller-tokens";

const neverCalled = () => {
  throw new Error("decrypt não deveria ter sido chamado");
};

describe("resolveRefreshPlain", () => {
  it("usa o refresh token que veio na resposta do ML", () => {
    const result = resolveRefreshPlain({
      tokenRefresh: "  TG-refresh-novo  ",
      existingRefreshEnc: "enc-antigo",
      decrypt: neverCalled,
    });
    assert.deepEqual(result, { ok: true, refreshPlain: "TG-refresh-novo" });
  });

  it("cai para o refresh guardado quando o ML omite (troca posterior)", () => {
    const result = resolveRefreshPlain({
      tokenRefresh: undefined,
      existingRefreshEnc: "enc-antigo",
      decrypt: (enc) => (enc === "enc-antigo" ? "TG-refresh-guardado" : ""),
    });
    assert.deepEqual(result, { ok: true, refreshPlain: "TG-refresh-guardado" });
  });

  it("reporta decrypt_failed quando a ENCRYPTION_KEY não abre o valor guardado", () => {
    const result = resolveRefreshPlain({
      tokenRefresh: "   ",
      existingRefreshEnc: "enc-de-outra-chave",
      decrypt: () => {
        throw new Error("bad tag");
      },
    });
    assert.deepEqual(result, { ok: false, reason: "decrypt_failed" });
  });

  it("reporta missing_refresh_token quando não há nada de onde tirar", () => {
    assert.deepEqual(
      resolveRefreshPlain({
        tokenRefresh: undefined,
        existingRefreshEnc: null,
        decrypt: neverCalled,
      }),
      { ok: false, reason: "missing_refresh_token" },
    );
  });

  it("trata refresh guardado vazio como ausente", () => {
    assert.deepEqual(
      resolveRefreshPlain({
        tokenRefresh: "",
        existingRefreshEnc: "enc-vazio",
        decrypt: () => "   ",
      }),
      { ok: false, reason: "missing_refresh_token" },
    );
  });
});
