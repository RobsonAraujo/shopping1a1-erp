/**
 * Varredura completa de `/orders/search` respeitando o teto de offset do ML.
 *
 * O ML recusa `offset >= 10.000` com 400 `limit.maximum_exceeded` ("Limit must
 * be a lower or equal than 10000", medido em 2026-11-06). Com ~5 mil pedidos
 * por mês, janelas de 90 a 120 dias já passam disso: o Potencial de
 * faturamento (120 dias) e a Lucratividade em "90 dias" quebravam inteiros.
 *
 * Quando o total de uma fatia chega perto do teto, ela é dividida ao meio no
 * tempo e cada metade é paginada à parte (recursivamente, porque o volume não
 * é uniforme entre os meses).
 *
 * Módulo puro: quem chama injeta `fetchPage` (URL, token e retry ficam em
 * `api.ts`), para dar para testar sem rede.
 */
import type { OrderSearchOrder } from "./types";

export const ML_ORDERS_SEARCH_MAX_OFFSET = 10_000;
export const ORDERS_SEARCH_PAGE_LIMIT = 50;
/**
 * Abaixo do teto de propósito: pedidos podem entrar na janela entre a 1ª
 * página e as seguintes, e o total de uma fatia não pode passar do teto no
 * meio da varredura.
 */
export const ORDERS_SEARCH_SLICE_MAX_TOTAL = 9_000;
/** Fatia menor que isto e ainda acima do teto não é um volume real — erro. */
const MIN_SLICE_MS = 60_000;

export type OrdersSearchRange = { from: Date; to: Date };

export type OrdersSearchPage = {
  results?: OrderSearchOrder[] | null;
  paging?: { total?: number | null } | null;
};

export type OrdersSearchProgress = { fetched: number; total: number | null };

export type ForEachOrdersSearchPageOptions = {
  from: Date;
  to: Date;
  fetchPage: (
    range: OrdersSearchRange,
    offset: number,
    limit: number,
  ) => Promise<OrdersSearchPage>;
  /** Recebe cada página já sem pedidos repetidos (por `order.id`). */
  onOrders: (orders: OrderSearchOrder[]) => void;
  /** Páginas em voo ao mesmo tempo dentro de uma fatia. 1 = sequencial. */
  concurrency?: number;
  signal?: AbortSignal;
  /** `total` é o da janela inteira (1ª página); `fetched`, os pedidos únicos já entregues. */
  onProgress?: (progress: OrdersSearchProgress) => void;
};

function reportedTotal(page: OrdersSearchPage): number | null {
  const total = page.paging?.total;
  return typeof total === "number" && Number.isFinite(total) && total >= 0
    ? total
    : null;
}

function resultCount(page: OrdersSearchPage): number {
  return page.results?.length ?? 0;
}

export async function forEachOrdersSearchPage(
  options: ForEachOrdersSearchPageOptions,
): Promise<void> {
  const limit = ORDERS_SEARCH_PAGE_LIMIT;
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
  const seen = new Set<string>();
  let fetched = 0;
  let progressTotal: number | null = null;

  const fetchPage = (range: OrdersSearchRange, offset: number) => {
    options.signal?.throwIfAborted();
    return options.fetchPage(range, offset, limit);
  };

  const emit = (page: OrdersSearchPage) => {
    const fresh: OrderSearchOrder[] = [];
    for (const order of page.results ?? []) {
      const id = order.id == null ? "" : String(order.id);
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      fresh.push(order);
    }
    fetched += fresh.length;
    if (fresh.length > 0) options.onOrders(fresh);
    options.onProgress?.({ fetched, total: progressTotal });
  };

  /** Sem `paging.total` não dá para saber se precisa fatiar: segue página a página. */
  async function scanWithoutTotal(range: OrdersSearchRange, first: OrdersSearchPage) {
    let page = first;
    let offset = 0;
    for (;;) {
      emit(page);
      if (resultCount(page) < limit) return;
      offset += limit;
      if (offset >= ML_ORDERS_SEARCH_MAX_OFFSET) {
        throw new Error(
          `orders/search sem paging.total e com ${ML_ORDERS_SEARCH_MAX_OFFSET} pedidos ou mais na janela; não dá para fatiar sem o total.`,
        );
      }
      page = await fetchPage(range, offset);
    }
  }

  async function scanSlice(range: OrdersSearchRange, isRoot: boolean): Promise<void> {
    const first = await fetchPage(range, 0);
    const total = reportedTotal(first);
    if (isRoot) progressTotal = total;

    if (total === null) {
      await scanWithoutTotal(range, first);
      return;
    }

    if (total > ORDERS_SEARCH_SLICE_MAX_TOTAL) {
      const spanMs = range.to.getTime() - range.from.getTime();
      if (spanMs < MIN_SLICE_MS) {
        throw new Error(
          `orders/search: ${total} pedidos entre ${range.from.toISOString()} e ${range.to.toISOString()}; a fatia não pode ser dividida mais.`,
        );
      }
      const mid = new Date(range.from.getTime() + Math.floor(spanMs / 2));
      // A mais nova primeiro mantém a ordem `date_desc` de quem coleta. As
      // metades compartilham o instante `mid`: o dedupe por id cobre o pedido
      // que cair exatamente nele, então nenhum fica de fora nem conta 2 vezes.
      await scanSlice({ from: mid, to: range.to }, false);
      await scanSlice({ from: range.from, to: mid }, false);
      return;
    }

    emit(first);
    if (resultCount(first) === 0) return;

    const offsets: number[] = [];
    for (let offset = limit; offset < total; offset += limit) offsets.push(offset);

    for (let i = 0; i < offsets.length; i += concurrency) {
      const chunk = offsets.slice(i, i + concurrency);
      const pages = await Promise.all(chunk.map((offset) => fetchPage(range, offset)));
      for (const page of pages) emit(page);
      // Página vazia antes do total: a janela encolheu durante a varredura.
      if (pages.some((page) => resultCount(page) === 0)) return;
    }
  }

  await scanSlice({ from: options.from, to: options.to }, true);
}
