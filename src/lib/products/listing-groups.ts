import { prisma } from "@/lib/db/db";

/**
 * Opções de venda: um produto físico, vários anúncios.
 *
 * No Mercado Livre, as "opções de venda" (Clássico, Premium, B2B…) são MLBs
 * diferentes com o mesmo `user_product_id` (UP), o mesmo SKU e o mesmo
 * estoque. O ERP identifica produto por MLB, então cada opção virava um
 * produto à parte. Este módulo junta as opções no **anúncio principal**:
 *
 * - O principal é um MLB de verdade (o cadastrado). Chaves, links e tabelas
 *   continuam sendo por MLB; as telas só trocam `mlItemId` por
 *   `principalOf(mlItemId)` antes de agrupar ou de buscar o cadastro.
 * - O grupo vem do UP gravado em `Listing` (e do item de estoque, que também
 *   junta um anúncio ligado à mão). Anúncio sem UP é um grupo sozinho, como
 *   sempre foi.
 * - O que é de cada anúncio (preço, tarifa, promoção, ADS, catálogo) continua
 *   por opção; o que é do produto físico (cadastro, estoque, venda somada)
 *   vale pelo principal.
 *
 * `StockItem.primaryMlItemId` acompanha esta regra (`alignStockPrimaries` em
 * `listing-groups-sync.ts`), para Estoque, Compras e a ponte do galpão
 * apontarem para o mesmo anúncio.
 */

export type ListingGroupListing = {
  mlItemId: string;
  userProductId: string | null;
  stockItemId: string | null;
  listingTypeId: string | null;
  catalogListing: boolean | null;
  mlStatus: string | null;
  createdAt: Date | null;
};

export type ListingGroupProduct = {
  mlItemId: string;
  needsCostReview: boolean;
  createdAt: Date;
};

export type ListingGroupsInput = {
  listings: ListingGroupListing[];
  products: ListingGroupProduct[];
  kitMlItemIds: string[];
  /** `StockItem.id` → `primaryMlItemId`. */
  stockPrimaryById: Map<string, string | null>;
};

/** Uma opção de venda do produto, para as telas mostrarem as etiquetas. */
export type ListingOption = {
  mlItemId: string;
  listingTypeId: string | null;
  catalogListing: boolean | null;
  mlStatus: string | null;
  /** Tem cadastro em Meus Produtos (`Product`). */
  registered: boolean;
  /** Cadastro ainda com custo pendente (veio do "Importar todos"). */
  pendingCost: boolean;
  isPrincipal: boolean;
};

export type ListingGroups = {
  /** Anúncio principal do produto de `mlItemId`; o próprio MLB quando não há opções. */
  principalOf(mlItemId: string): string;
  /** Todas as opções do produto de `mlItemId`, principal primeiro (1 item quando não há opções). */
  optionsOf(mlItemId: string): ListingOption[];
  /** `true` quando o anúncio é uma opção de venda que não é o principal. */
  isOption(mlItemId: string): boolean;
  /** Produtos com mais de uma opção de venda. */
  multiOptionGroups(): ListingOption[][];
  /** Itens de estoque cujo principal gravado difere da regra (o principal já está ligado ao item). */
  stockPrimaryMismatches(): Array<{ stockItemId: string; principal: string }>;
};

export type PrincipalCandidate = {
  mlItemId: string;
  /** Cadastro do anúncio, se houver. */
  product: { pending: boolean; createdAt: Date } | null;
  isKit: boolean;
  active: boolean;
  /** Desde quando o ERP conhece o anúncio (ou a data do ML). */
  firstSeenAt: Date | null;
};

function time(value: Date | null | undefined): number {
  return value ? value.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Regra do anúncio principal de um produto físico:
 *
 * 1. o anúncio com cadastro (para kit, com `Kit`). Com mais de um cadastro:
 *    o que tem custo vence o pendente; depois o principal do estoque; por
 *    último o cadastro mais antigo;
 * 2. sem cadastro: o principal do estoque;
 * 3. senão: o anúncio ativo, depois o mais antigo, depois o MLB.
 *
 * O status do anúncio fica fora dos passos 1 e 2 de propósito: o principal
 * não pode trocar sozinho porque uma opção foi pausada.
 */
export function pickPrincipal(
  candidates: readonly PrincipalCandidate[],
  stockPrimaries: ReadonlySet<string> = new Set(),
): string {
  if (candidates.length === 0) throw new Error("pickPrincipal: grupo vazio");
  if (candidates.length === 1) return candidates[0].mlItemId;

  const isStockPrimary = (c: PrincipalCandidate) => (stockPrimaries.has(c.mlItemId) ? 1 : 0);
  const byId = (a: PrincipalCandidate, b: PrincipalCandidate) => a.mlItemId.localeCompare(b.mlItemId);

  const registered = candidates.filter((c) => c.product);
  if (registered.length > 0) {
    return [...registered].sort(
      (a, b) =>
        Number(a.product!.pending) - Number(b.product!.pending) ||
        isStockPrimary(b) - isStockPrimary(a) ||
        a.product!.createdAt.getTime() - b.product!.createdAt.getTime() ||
        byId(a, b),
    )[0].mlItemId;
  }

  const kits = candidates.filter((c) => c.isKit);
  if (kits.length > 0) {
    return [...kits].sort((a, b) => time(a.firstSeenAt) - time(b.firstSeenAt) || byId(a, b))[0]
      .mlItemId;
  }

  const stockPrimary = candidates.find((c) => stockPrimaries.has(c.mlItemId));
  if (stockPrimary) return stockPrimary.mlItemId;

  return [...candidates].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      time(a.firstSeenAt) - time(b.firstSeenAt) ||
      byId(a, b),
  )[0].mlItemId;
}

const LISTING_TYPE_ORDER: Record<string, number> = { gold_special: 0, gold_pro: 1 };

function optionOrder(a: ListingOption, b: ListingOption): number {
  return (
    Number(b.isPrincipal) - Number(a.isPrincipal) ||
    (LISTING_TYPE_ORDER[a.listingTypeId ?? ""] ?? 9) - (LISTING_TYPE_ORDER[b.listingTypeId ?? ""] ?? 9) ||
    a.mlItemId.localeCompare(b.mlItemId)
  );
}

/** Union-find mínimo sobre MLBs. */
class DisjointSet {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root) as string;
    let cur = id;
    while (cur !== root) {
      const next = this.parent.get(cur) as string;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  ids(): string[] {
    return [...this.parent.keys()];
  }
}

/** Monta os grupos a partir das linhas já lidas (puro, testável). */
export function buildListingGroups(input: ListingGroupsInput): ListingGroups {
  const listingById = new Map(input.listings.map((l) => [l.mlItemId, l]));
  const productById = new Map(input.products.map((p) => [p.mlItemId, p]));
  const kitIds = new Set(input.kitMlItemIds);

  const sets = new DisjointSet();
  const firstByUp = new Map<string, string>();
  const firstByStockItem = new Map<string, string>();
  for (const listing of input.listings) {
    sets.add(listing.mlItemId);
    if (listing.userProductId) {
      const first = firstByUp.get(listing.userProductId);
      if (first) sets.union(first, listing.mlItemId);
      else firstByUp.set(listing.userProductId, listing.mlItemId);
    }
    if (listing.stockItemId) {
      const first = firstByStockItem.get(listing.stockItemId);
      if (first) sets.union(first, listing.mlItemId);
      else firstByStockItem.set(listing.stockItemId, listing.mlItemId);
    }
  }

  const membersByRoot = new Map<string, string[]>();
  for (const id of sets.ids()) {
    const root = sets.find(id);
    const list = membersByRoot.get(root) ?? [];
    list.push(id);
    membersByRoot.set(root, list);
  }

  const principalById = new Map<string, string>();
  const optionsByPrincipal = new Map<string, ListingOption[]>();
  const mismatches: Array<{ stockItemId: string; principal: string }> = [];

  for (const members of membersByRoot.values()) {
    const stockItemIds = new Set(
      members.map((id) => listingById.get(id)?.stockItemId).filter((v): v is string => Boolean(v)),
    );
    const stockPrimaries = new Set(
      [...stockItemIds]
        .map((sid) => input.stockPrimaryById.get(sid))
        .filter((v): v is string => Boolean(v) && members.includes(v as string)),
    );
    const candidates: PrincipalCandidate[] = members.map((id) => {
      const product = productById.get(id);
      const listing = listingById.get(id);
      return {
        mlItemId: id,
        product: product ? { pending: product.needsCostReview, createdAt: product.createdAt } : null,
        isKit: kitIds.has(id),
        active: listing?.mlStatus === "active",
        firstSeenAt: listing?.createdAt ?? null,
      };
    });
    const principal = pickPrincipal(candidates, stockPrimaries);

    const options = members
      .map((id): ListingOption => {
        const listing = listingById.get(id);
        const product = productById.get(id);
        return {
          mlItemId: id,
          listingTypeId: listing?.listingTypeId ?? null,
          catalogListing: listing?.catalogListing ?? null,
          mlStatus: listing?.mlStatus ?? null,
          registered: Boolean(product),
          pendingCost: product?.needsCostReview ?? false,
          isPrincipal: id === principal,
        };
      })
      .sort(optionOrder);
    for (const id of members) principalById.set(id, principal);
    optionsByPrincipal.set(principal, options);

    const principalStockItem = listingById.get(principal)?.stockItemId ?? null;
    if (principalStockItem && input.stockPrimaryById.get(principalStockItem) !== principal) {
      mismatches.push({ stockItemId: principalStockItem, principal });
    }
  }

  const principalOf = (mlItemId: string) => principalById.get(mlItemId) ?? mlItemId;

  return {
    principalOf,
    optionsOf(mlItemId) {
      const principal = principalOf(mlItemId);
      const options = optionsByPrincipal.get(principal);
      if (options) return options;
      const product = productById.get(mlItemId);
      return [
        {
          mlItemId,
          listingTypeId: null,
          catalogListing: null,
          mlStatus: null,
          registered: Boolean(product),
          pendingCost: product?.needsCostReview ?? false,
          isPrincipal: true,
        },
      ];
    },
    isOption(mlItemId) {
      return principalOf(mlItemId) !== mlItemId;
    },
    multiOptionGroups() {
      return [...optionsByPrincipal.values()].filter((options) => options.length > 1);
    },
    stockPrimaryMismatches() {
      return mismatches;
    },
  };
}

/** Grupos sem nenhum anúncio (organização nova): tudo é o próprio MLB. */
export function emptyListingGroups(): ListingGroups {
  return buildListingGroups({
    listings: [],
    products: [],
    kitMlItemIds: [],
    stockPrimaryById: new Map(),
  });
}

/**
 * Anúncio lido agora do ML que ainda não está em `Listing` (opção recém-criada):
 * entra no grupo pelo UP do corpo do anúncio, sem esperar a próxima rodada de
 * vínculo.
 */
export type ListingGroupExtraItem = {
  id: string;
  user_product_id?: string | null;
  listing_type_id?: string | null;
  catalog_listing?: boolean | null;
  status?: string | null;
};

/**
 * Carrega os grupos de uma organização: 4 consultas pequenas (anúncios,
 * cadastros, kits, itens de estoque). Chame uma vez por requisição e passe
 * adiante aos helpers que aceitam `groups`.
 */
export async function loadListingGroups(
  organizationId: string,
  options?: { extraItems?: readonly ListingGroupExtraItem[] },
): Promise<ListingGroups> {
  const [listings, products, kits, stockItems] = await Promise.all([
    prisma.listing.findMany({
      where: { organizationId },
      select: {
        mlItemId: true,
        userProductId: true,
        stockItemId: true,
        listingTypeId: true,
        catalogListing: true,
        mlStatus: true,
        createdAt: true,
      },
    }),
    prisma.product.findMany({
      where: { organizationId },
      select: { mlItemId: true, needsCostReview: true, createdAt: true },
    }),
    prisma.kit.findMany({ where: { organizationId }, select: { mlItemId: true } }),
    prisma.stockItem.findMany({
      where: { organizationId },
      select: { id: true, primaryMlItemId: true },
    }),
  ]);

  const known = new Set(listings.map((l) => l.mlItemId));
  const extra: ListingGroupListing[] = [];
  for (const item of options?.extraItems ?? []) {
    const up = typeof item.user_product_id === "string" ? item.user_product_id.trim() : "";
    if (!item.id || known.has(item.id) || !up) continue;
    known.add(item.id);
    extra.push({
      mlItemId: item.id,
      userProductId: up,
      stockItemId: null,
      listingTypeId: item.listing_type_id ?? null,
      catalogListing: item.catalog_listing ?? null,
      mlStatus: item.status ?? null,
      createdAt: null,
    });
  }

  return buildListingGroups({
    listings: [...listings, ...extra],
    products,
    kitMlItemIds: kits.map((k) => k.mlItemId),
    stockPrimaryById: new Map(stockItems.map((s) => [s.id, s.primaryMlItemId])),
  });
}

/**
 * Faz `StockItem.primaryMlItemId` seguir o principal das opções de venda
 * (o anúncio cadastrado). Normalmente não há nada a mudar; muda quando o
 * cadastro entra numa opção que não era o principal do estoque.
 */
export async function alignStockPrimaries(
  organizationId: string,
  groups?: ListingGroups,
): Promise<number> {
  const resolved = groups ?? (await loadListingGroups(organizationId));
  const mismatches = resolved.stockPrimaryMismatches();
  for (const { stockItemId, principal } of mismatches) {
    await prisma.stockItem.updateMany({
      where: { id: stockItemId, organizationId },
      data: { primaryMlItemId: principal },
    });
  }
  return mismatches.length;
}
