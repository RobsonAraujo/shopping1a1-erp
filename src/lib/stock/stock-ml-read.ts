import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import { MlApiFetchError, fetchWithRetry } from "@/lib/mercadolibre/fetch-with-retry";

/**
 * Leituras do Mercado Livre usadas pelo estoque automático. Conferido na
 * conta real (nov/2026) com o vendedor em multi-origem (`warehouse_management`).
 *
 * - `GET /user-products/{UP}/stock` → `locations[]`:
 *   - `seller_warehouse` (`store_id`, `network_node_id`, `quantity`) é o
 *     depósito do vendedor;
 *   - `meli_facility` (`quantity`) é o Full disponível.
 *   O depósito existe inclusive em anúncio Full, e o `/items` desses anúncios
 *   só mostra o Full. `selling_address` é o depósito nas contas de convivência
 *   Full/Flex de outros sites; é tratado igual.
 * - `GET /inventories/{inventory_id}/stock/fulfillment` → disponível + não
 *   disponível (`transfer` = em transferência entre centros do ML,
 *   `internal_process`, avaria, fiscal…) e `total` (tudo que está com o ML).
 */

export type UserProductStockRead = {
  /** Soma das locations de depósito do vendedor; `null` se o UP não tem nenhuma. */
  depositQty: number | null;
  /** `meli_facility`, quando existe. */
  fullAvailableQty: number | null;
  /** `network_node_id` das locations de depósito (nós do vendedor). */
  sellerNodeIds: string[];
};

const DEPOSIT_LOCATION_TYPES = new Set(["seller_warehouse", "selling_address"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function quantityOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function parseUserProductStock(body: unknown): UserProductStockRead {
  const record = asRecord(body);
  const locations = Array.isArray(record?.locations) ? record.locations : [];
  let deposit: number | null = null;
  let full: number | null = null;
  const nodes = new Set<string>();
  for (const raw of locations) {
    const loc = asRecord(raw);
    if (!loc) continue;
    const type = typeof loc.type === "string" ? loc.type : "";
    if (DEPOSIT_LOCATION_TYPES.has(type)) {
      deposit = (deposit ?? 0) + quantityOf(loc.quantity);
      const node = loc.network_node_id;
      if (typeof node === "string" && node.trim()) nodes.add(node.trim());
    } else if (type === "meli_facility") {
      full = (full ?? 0) + quantityOf(loc.quantity);
    }
  }
  return { depositQty: deposit, fullAvailableQty: full, sellerNodeIds: [...nodes] };
}

/** Lança `MlApiFetchError` em falha. `null` quando o UP não tem estoque inicializado (404). */
export async function fetchUserProductStock(
  accessToken: string,
  userProductId: string,
  signal?: AbortSignal,
): Promise<UserProductStockRead | null> {
  const { apiBase } = getMercadoLibreConfig();
  try {
    const res = await fetchWithRetry(
      `${apiBase}/user-products/${encodeURIComponent(userProductId)}/stock`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal },
      { maxAttempts: 4, backoffMs: [1000, 2500, 5000] },
    );
    return parseUserProductStock(await res.json());
  } catch (err) {
    if (err instanceof MlApiFetchError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Estoque de um inventário Full, por status. Conferido em nov/2026:
 * `not_available_detail` traz `transfer` (entre centros do ML),
 * `internal_process`, `withdrawal` (retirada: voltando para o vendedor),
 * `lost` (perdido pelo ML), `noFiscalCoverage`, `damaged`…
 */
/** Unidades fora da venda no Full, por status do ML (inclui `lost`). */
export type FullStatusQty = { status: string; quantity: number };

export type FulfillmentRead = {
  available: number;
  /** `transfer`: andando entre os centros do ML (o "em transferência" do ML). */
  inTransfer: number;
  /** `withdrawal`: reservado para voltar ao vendedor. */
  withdrawal: number;
  /** `lost`: o ML perdeu (reembolsa). Fica fora do total. */
  lost: number;
  /** Demais não disponíveis (sem cobertura fiscal, processo interno, avaria…). */
  other: number;
  /** Tudo que está com o ML, menos o perdido. */
  custody: number;
  /** A quebra do ML por status, para a tela nomear cada parte. */
  detail: FullStatusQty[];
};

/** Soma por status, na ordem em que cada status apareceu. */
function addDetail(into: Map<string, number>, status: string, quantity: number) {
  if (quantity <= 0) return;
  into.set(status, (into.get(status) ?? 0) + quantity);
}

function detailList(map: Map<string, number>): FullStatusQty[] {
  return [...map].map(([status, quantity]) => ({ status, quantity }));
}

export function parseFulfillmentRead(body: unknown): FulfillmentRead {
  const record = asRecord(body) ?? {};
  const available = quantityOf(record.available_quantity);
  let inTransfer = 0;
  let withdrawal = 0;
  let lost = 0;
  let other = 0;
  const byStatus = new Map<string, number>();
  const details = Array.isArray(record.not_available_detail) ? record.not_available_detail : [];
  for (const raw of details) {
    const entry = asRecord(raw);
    if (!entry) continue;
    const qty = quantityOf(entry.quantity);
    const status = typeof entry.status === "string" && entry.status ? entry.status : "unknown";
    addDetail(byStatus, status, qty);
    if (status === "transfer") inTransfer += qty;
    else if (status === "withdrawal") withdrawal += qty;
    else if (status === "lost") lost += qty;
    else other += qty;
  }
  return {
    available,
    inTransfer,
    withdrawal,
    lost,
    other,
    custody: available + inTransfer + withdrawal + other,
    detail: detailList(byStatus),
  };
}

/** Lança `MlApiFetchError` em falha. */
export async function fetchFulfillmentStockStrict(
  accessToken: string,
  inventoryId: string,
  signal?: AbortSignal,
): Promise<FulfillmentRead> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetchWithRetry(
    `${apiBase}/inventories/${encodeURIComponent(inventoryId)}/stock/fulfillment`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal },
    { maxAttempts: 4, backoffMs: [1000, 2500, 5000] },
  );
  return parseFulfillmentRead(await res.json());
}

/** Leitura consolidada de um item de estoque (todas as UPs e inventários dele). */
export type StockItemMlRead = {
  depositQty: number | null;
  fullAvailableQty: number | null;
  fullTransferQty: number | null;
  fullOtherQty: number | null;
  fullWithdrawalQty: number | null;
  fullLostQty: number | null;
  /** Com o ML, menos o perdido. */
  fullTotalQty: number | null;
  /** Fora da venda no Full, por status (inclui o perdido). */
  fullUnavailableDetail: FullStatusQty[] | null;
  sellerNodeIds: string[];
};

/**
 * Junta as leituras de um item. Uma UP ou um inventário que falhou faz o item
 * inteiro falhar: número parcial é pior que nenhum.
 */
export function combineStockItemReads(input: {
  userProducts: UserProductStockRead[];
  fulfillment: FulfillmentRead[];
  hasFull: boolean;
}): StockItemMlRead {
  const { userProducts, fulfillment, hasFull } = input;
  let deposit: number | null = null;
  let upFull: number | null = null;
  const nodes = new Set<string>();
  for (const up of userProducts) {
    if (up.depositQty != null) deposit = (deposit ?? 0) + up.depositQty;
    if (up.fullAvailableQty != null) upFull = (upFull ?? 0) + up.fullAvailableQty;
    for (const node of up.sellerNodeIds) nodes.add(node);
  }

  if (fulfillment.length === 0) {
    // Sem inventário Full: o Full é o que o UP disser (normalmente nada).
    const fullAvailable = upFull ?? (hasFull ? null : 0);
    const zero = fullAvailable == null ? null : 0;
    return {
      depositQty: deposit ?? 0,
      fullAvailableQty: fullAvailable,
      fullTransferQty: zero,
      fullOtherQty: zero,
      fullWithdrawalQty: zero,
      fullLostQty: zero,
      fullTotalQty: fullAvailable,
      fullUnavailableDetail: fullAvailable == null ? null : [],
      sellerNodeIds: [...nodes],
    };
  }

  const sum = (pick: (r: FulfillmentRead) => number) => fulfillment.reduce((acc, r) => acc + pick(r), 0);
  const byStatus = new Map<string, number>();
  for (const read of fulfillment) for (const d of read.detail) addDetail(byStatus, d.status, d.quantity);
  return {
    depositQty: deposit ?? 0,
    fullAvailableQty: sum((r) => r.available),
    fullTransferQty: sum((r) => r.inTransfer),
    fullOtherQty: sum((r) => r.withdrawal + r.other),
    fullWithdrawalQty: sum((r) => r.withdrawal),
    fullLostQty: sum((r) => r.lost),
    fullTotalQty: sum((r) => r.custody),
    fullUnavailableDetail: detailList(byStatus),
    sellerNodeIds: [...nodes],
  };
}
