import { prisma } from "@/lib/db/db";
import { loadListingImageUrlsByMlItemId } from "@/lib/products/product-data";
import { loadListingGroups } from "@/lib/products/listing-groups";

export type SupplierRow = {
  id: string;
  name: string;
  active: boolean;
  productCount: number;
};

export type UnassignedProduct = { mlItemId: string; sku: string | null; imageUrl: string | null };
export type AssignedProduct = { mlItemId: string; sku: string | null; supplierId: string };

/** Compartilhado entre `GET /api/suppliers` e o carregamento inicial (server) da
 * tela Fornecedores, pra manter uma única fonte da mesma query. */
export async function loadSuppliers(
  organizationId: string,
  options?: { onlyActive?: boolean },
): Promise<SupplierRow[]> {
  const [suppliers, products, groups] = await Promise.all([
    prisma.supplier.findMany({
      where: { organizationId, ...(options?.onlyActive ? { active: true } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    prisma.product.findMany({
      where: { organizationId, supplierId: { not: null } },
      select: { mlItemId: true, supplierId: true },
    }),
    loadListingGroups(organizationId),
  ]);
  // Opções de venda: conta produto físico — o cadastro duplicado de uma
  // opção não é outro produto do fornecedor.
  const countBySupplier = new Map<string, number>();
  for (const product of products) {
    if (!product.supplierId || groups.isOption(product.mlItemId)) continue;
    countBySupplier.set(product.supplierId, (countBySupplier.get(product.supplierId) ?? 0) + 1);
  }
  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    productCount: countBySupplier.get(s.id) ?? 0,
  }));
}

/** Lista enxuta (sem custo/imposto) dos produtos sem fornecedor vinculado —
 * usada só pra popular o quadro de "arrastar pro fornecedor" em Fornecedores.
 * Miniatura via `loadListingImageUrlsByMlItemId`, mesma busca em lote de Meus Produtos. */
export async function loadUnassignedProducts(
  organizationId: string,
): Promise<UnassignedProduct[]> {
  const [allRows, groups] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId, supplierId: null, active: true },
      orderBy: { sku: "asc" },
      select: { mlItemId: true, sku: true },
    }),
    loadListingGroups(organizationId),
  ]);
  // O fornecedor é do produto: o cadastro duplicado de uma opção de venda
  // não aparece para arrastar (vale o do principal).
  const rows = allRows.filter((p) => !groups.isOption(p.mlItemId));
  const imageUrlsByMlItemId = await loadListingImageUrlsByMlItemId(
    organizationId,
    rows.map((p) => p.mlItemId),
  );
  return rows.map((p) => ({
    mlItemId: p.mlItemId,
    sku: p.sku,
    imageUrl: imageUrlsByMlItemId.get(p.mlItemId) ?? null,
  }));
}

/** Lista enxuta (mlItemId, sku, supplierId) dos produtos JÁ vinculados a um
 * fornecedor. Sem imagem de propósito (evita N lookups de thumbnail numa
 * lista que pode ser maior que a de não vinculados). */
export async function loadAssignedProducts(
  organizationId: string,
): Promise<AssignedProduct[]> {
  const [allRows, groups] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId, supplierId: { not: null }, active: true },
      orderBy: { sku: "asc" },
      select: { mlItemId: true, sku: true, supplierId: true },
    }),
    loadListingGroups(organizationId),
  ]);
  const rows = allRows.filter((p) => !groups.isOption(p.mlItemId));
  return rows.map((p) => ({
    mlItemId: p.mlItemId,
    sku: p.sku,
    supplierId: p.supplierId as string,
  }));
}
