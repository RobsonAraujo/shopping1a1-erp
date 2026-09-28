import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fromDbSellerId,
  parseSellerId,
  toDbSellerId,
} from "@/lib/mercadolibre/seller-id";

// A conta que quebrou o signup em produção: 3711648215 > 2^31 - 1 (2147483647).
const SELLER_ID_QUE_QUEBROU = 3711648215;

describe("toDbSellerId / fromDbSellerId", () => {
  it("faz round-trip do id que estourava a coluna INTEGER", () => {
    assert.ok(SELLER_ID_QUE_QUEBROU > 2 ** 31 - 1, "o id do bug tem que passar de 2^31");
    const asDb = toDbSellerId(SELLER_ID_QUE_QUEBROU);
    assert.equal(typeof asDb, "bigint");
    assert.equal(fromDbSellerId(asDb), SELLER_ID_QUE_QUEBROU);
  });

  it("aceita um id antigo, abaixo de 2^31", () => {
    assert.equal(fromDbSellerId(toDbSellerId(123456789)), 123456789);
  });

  it("recusa entrada que não é id de vendedor", () => {
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => toDbSellerId(invalid), `deveria recusar ${invalid}`);
    }
  });

  it("recusa um bigint fora da faixa exata de Number", () => {
    assert.throws(() => fromDbSellerId(BigInt("9007199254740993")));
    assert.throws(() => fromDbSellerId(BigInt(0)));
  });
});

describe("parseSellerId", () => {
  it("lê o id do cookie de sessão", () => {
    assert.equal(parseSellerId(String(SELLER_ID_QUE_QUEBROU)), SELLER_ID_QUE_QUEBROU);
    assert.equal(parseSellerId(" 123456789 "), 123456789);
  });

  it("devolve undefined em vez de NaN para cookie inválido", () => {
    // `parseInt("abc", 10)` daria NaN e o NaN descia até o Prisma.
    for (const invalid of ["", "abc", "12abc", "-1", "1.5", null, undefined]) {
      assert.equal(parseSellerId(invalid), undefined, `deveria recusar ${invalid}`);
    }
  });

  it("devolve undefined para id acima da faixa exata de Number", () => {
    assert.equal(parseSellerId("9007199254740993"), undefined);
  });
});
