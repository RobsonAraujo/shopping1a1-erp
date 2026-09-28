import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ML_COOKIE, readSession } from "@/lib/mercadolibre/session";

function fakeCookieStore(values: Record<string, string>) {
  return {
    get(name: string) {
      const value = values[name];
      return value === undefined ? undefined : { value };
    },
  };
}

describe("readSession", () => {
  it("lê um ml_user_id acima de 2^31 sem perder precisão", () => {
    // O id que quebrou o signup em produção.
    const session = readSession(
      fakeCookieStore({
        [ML_COOKIE.access]: "access-token",
        [ML_COOKIE.userId]: "3711648215",
      }),
    );
    assert.equal(session.userId, 3711648215);
    assert.equal(session.accessToken, "access-token");
  });

  it("devolve undefined (não NaN) quando o cookie de userId está corrompido", () => {
    for (const corrupted of ["", "abc", "12abc", "-5"]) {
      const session = readSession(
        fakeCookieStore({ [ML_COOKIE.userId]: corrupted }),
      );
      assert.equal(
        session.userId,
        undefined,
        `cookie ${JSON.stringify(corrupted)} deveria virar undefined`,
      );
    }
  });

  it("devolve undefined quando não há cookie de userId", () => {
    assert.equal(readSession(fakeCookieStore({})).userId, undefined);
  });
});
