import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ML_ORDERS_SEARCH_MAX_OFFSET,
  forEachOrdersSearchPage,
  type OrdersSearchPage,
  type OrdersSearchRange,
} from "../orders-search";
import type { OrderSearchOrder } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const TO = new Date("2026-11-06T12:00:00.000Z");
const FROM = new Date(TO.getTime() - 120 * DAY);

type FakeOrder = { id: number; at: number };

/**
 * Pedidos concentrados no fim da janela (o volume cresce mês a mês), para a
 * fatia mais recente precisar de mais de um corte.
 */
function makeOrders(count: number, from = FROM, to = TO): FakeOrder[] {
  const span = to.getTime() - from.getTime();
  return Array.from({ length: count }, (_, i) => {
    const r = (i + 0.5) / count;
    return { id: i + 1, at: from.getTime() + Math.floor(span * Math.sqrt(r)) };
  });
}

/** `/orders/search` falso: filtro inclusivo nas 2 pontas, `date_desc`, teto de offset do ML. */
function fakeMl(orders: FakeOrder[], options: { omitTotal?: boolean } = {}) {
  const sorted = [...orders].sort((a, b) => b.at - a.at);
  const calls: Array<{ from: number; to: number; offset: number }> = [];
  const fetchPage = async (
    range: OrdersSearchRange,
    offset: number,
    limit: number,
  ): Promise<OrdersSearchPage> => {
    calls.push({ from: range.from.getTime(), to: range.to.getTime(), offset });
    if (offset >= ML_ORDERS_SEARCH_MAX_OFFSET) {
      throw new Error("400 limit.maximum_exceeded");
    }
    const inRange = sorted.filter(
      (o) => o.at >= range.from.getTime() && o.at <= range.to.getTime(),
    );
    const results: OrderSearchOrder[] = inRange
      .slice(offset, offset + limit)
      .map((o) => ({ id: o.id, status: "paid", date_closed: new Date(o.at).toISOString() }));
    return options.omitTotal
      ? { results, paging: {} }
      : { results, paging: { total: inRange.length } };
  };
  return { fetchPage, calls };
}

async function collect(
  fetchPage: (range: OrdersSearchRange, offset: number, limit: number) => Promise<OrdersSearchPage>,
  extra: { concurrency?: number; from?: Date; to?: Date } = {},
) {
  const orders: OrderSearchOrder[] = [];
  const progress: Array<{ fetched: number; total: number | null }> = [];
  await forEachOrdersSearchPage({
    from: extra.from ?? FROM,
    to: extra.to ?? TO,
    fetchPage,
    concurrency: extra.concurrency,
    onOrders: (batch) => orders.push(...batch),
    onProgress: (p) => progress.push(p),
  });
  return { orders, progress };
}

describe("forEachOrdersSearchPage", () => {
  it("collects every order of a window above the 10.000 offset cap, without hitting the cap", async () => {
    const all = makeOrders(12_600);
    const ml = fakeMl(all);
    const { orders, progress } = await collect(ml.fetchPage);

    assert.equal(orders.length, 12_600);
    assert.equal(new Set(orders.map((o) => o.id)).size, 12_600);
    assert.ok(ml.calls.every((c) => c.offset < ML_ORDERS_SEARCH_MAX_OFFSET));
    // Mais novo primeiro, como o `sort=date_desc` de uma janela só.
    const times = orders.map((o) => new Date(o.date_closed!).getTime());
    assert.ok(times.every((t, i) => i === 0 || times[i - 1]! >= t));
    // Progresso usa o total da janela inteira.
    assert.equal(progress.at(-1)?.total, 12_600);
    assert.equal(progress.at(-1)?.fetched, 12_600);
  });

  it("counts once an order sitting exactly on the split instant", async () => {
    const mid = FROM.getTime() + Math.floor((TO.getTime() - FROM.getTime()) / 2);
    const all = makeOrders(12_000);
    all.push({ id: 999_999, at: mid });
    const ml = fakeMl(all);
    const { orders } = await collect(ml.fetchPage);

    assert.equal(orders.filter((o) => o.id === 999_999).length, 1);
    assert.equal(orders.length, 12_001);
    // Confere que o corte aconteceu mesmo nesse instante.
    assert.ok(ml.calls.some((c) => c.from === mid || c.to === mid));
  });

  it("returns the same orders with parallel pages", async () => {
    const all = makeOrders(12_600);
    const sequential = await collect(fakeMl(all).fetchPage);
    const parallel = await collect(fakeMl(all).fetchPage, { concurrency: 6 });

    assert.deepEqual(
      parallel.orders.map((o) => o.id).sort((a, b) => Number(a) - Number(b)),
      sequential.orders.map((o) => o.id).sort((a, b) => Number(a) - Number(b)),
    );
  });

  it("does not split a small window (no extra requests)", async () => {
    const ml = fakeMl(makeOrders(120));
    const { orders } = await collect(ml.fetchPage);

    assert.equal(orders.length, 120);
    assert.deepEqual(
      ml.calls.map((c) => c.offset),
      [0, 50, 100],
    );
  });

  it("pages sequentially when ML omits paging.total", async () => {
    const ml = fakeMl(makeOrders(120), { omitTotal: true });
    const { orders, progress } = await collect(ml.fetchPage);

    assert.equal(orders.length, 120);
    assert.equal(progress.at(-1)?.total, null);
  });

  it("stops when the signal is aborted", async () => {
    const ml = fakeMl(makeOrders(500));
    const controller = new AbortController();
    await assert.rejects(
      forEachOrdersSearchPage({
        from: FROM,
        to: TO,
        fetchPage: ml.fetchPage,
        signal: controller.signal,
        onOrders: () => controller.abort(),
      }),
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
    assert.equal(ml.calls.length, 1);
  });
});
