import { prisma } from "@/lib/db/db";
import { loadListingImageUrlsBySku } from "@/lib/products/product-data";

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
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId, ...(options?.onlyActive ? { active: true } : {}) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { products: true } },
    },
  });
  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    productCount: s._count.products,
  }));
}

/** Lista enxuta (sem custo/imposto) dos produtos sem fornecedor vinculado —
 * usada só pra popular o quadro de "arrastar pro fornecedor" em Fornecedores.
 * Miniatura via `loadListingImageUrlsBySku`, mesma busca em lote de Meus Produtos. */
export async function loadUnassignedProducts(
  organizationId: string,
): Promise<UnassignedProduct[]> {
  const rows = await prisma.product.findMany({
    where: { organizationId, supplierId: null },
    orderBy: { sku: "asc" },
    select: { mlItemId: true, sku: true },
  });
  const skus = rows.map((p) => p.sku).filter((s): s is string => s !== null);
  const imageUrlsBySku = await loadListingImageUrlsBySku(organizationId, skus);
  return rows.map((p) => ({
    mlItemId: p.mlItemId,
    sku: p.sku,
    imageUrl: p.sku ? (imageUrlsBySku.get(p.sku) ?? null) : null,
  }));
}

/** Lista enxuta (mlItemId, sku, supplierId) dos produtos JÁ vinculados a um
 * fornecedor. Sem imagem de propósito (evita N lookups de thumbnail numa
 * lista que pode ser maior que a de não vinculados). */
export async function loadAssignedProducts(
  organizationId: string,
): Promise<AssignedProduct[]> {
  const rows = await prisma.product.findMany({
    where: { organizationId, supplierId: { not: null } },
    orderBy: { sku: "asc" },
    select: { mlItemId: true, sku: true, supplierId: true },
  });
  return rows.map((p) => ({
    mlItemId: p.mlItemId,
    sku: p.sku,
    supplierId: p.supplierId as string,
  }));
}
