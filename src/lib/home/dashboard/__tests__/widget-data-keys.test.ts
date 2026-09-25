import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_WIDGET_DATA_KEYS,
  parseHomeWidgetDataKeys,
  serializeHomeWidgetDataKeys,
} from "@/lib/home/dashboard/widget-data-keys";

/**
 * Com uma chave de batch só (`finance`), os casos de "duas chaves distintas num
 * request" saem de cena — voltam junto com a segunda chave. O que permanece
 * coberto aqui é o que protege a rota: chave desconhecida descartada,
 * `__proto__`/`constructor` rejeitados e ordem/dedup estáveis (é a string de
 * chaves que serve de dependência de effect no client).
 */
describe("parseHomeWidgetDataKeys", () => {
  it("aceita as chaves conhecidas", () => {
    assert.deepEqual(parseHomeWidgetDataKeys("finance"), ["finance"]);
    // Uma chave só hoje; o formato de lista continua valendo.
    assert.deepEqual(parseHomeWidgetDataKeys("finance,finance"), ["finance"]);
  });

  it("descarta chave desconhecida em vez de falhar", () => {
    assert.deepEqual(parseHomeWidgetDataKeys("finance,fantasma"), ["finance"]);
    // chaves de widgets removidos não podem voltar a ser aceitas
    assert.deepEqual(parseHomeWidgetDataKeys("taxes,stock"), []);
    assert.deepEqual(parseHomeWidgetDataKeys("fantasma"), []);
    assert.deepEqual(parseHomeWidgetDataKeys(""), []);
    assert.deepEqual(parseHomeWidgetDataKeys(",,,"), []);
  });

  it("não deixa passar chave de poluição de protótipo", () => {
    // a query string é entrada do usuário e alimentaria um lookup de
    // resolvers — "__proto__" e "constructor" precisam morrer aqui.
    assert.deepEqual(parseHomeWidgetDataKeys("__proto__"), []);
    assert.deepEqual(parseHomeWidgetDataKeys("constructor"), []);
    assert.deepEqual(parseHomeWidgetDataKeys("prototype,toString"), []);
    assert.deepEqual(parseHomeWidgetDataKeys("__proto__,finance"), ["finance"]);
  });

  it("deduplica e normaliza a ordem (dependência estável de effect)", () => {
    assert.deepEqual(parseHomeWidgetDataKeys("finance,finance"), ["finance"]);
    assert.deepEqual(parseHomeWidgetDataKeys(" finance "), ["finance"]);
  });

  it("serializa de volta na mesma ordem estável", () => {
    assert.equal(serializeHomeWidgetDataKeys([]), "");
    assert.equal(serializeHomeWidgetDataKeys(["finance"]), "finance");
    assert.equal(
      serializeHomeWidgetDataKeys(HOME_WIDGET_DATA_KEYS),
      HOME_WIDGET_DATA_KEYS.join(","),
    );
  });
});
