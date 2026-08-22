import { prisma } from "@/lib/db";
import { normalizeProductSku } from "@/lib/product-pricing";
import type { SkuAliasMap } from "@/lib/product-sku-alias";

export type { SkuAliasMap } from "@/lib/product-sku-alias";

export async function loadSkuAliasMap(
  organizationId: string,
): Promise<SkuAliasMap> {
  const rows = await prisma.productSkuAlias.findMany({
    where: { organizationId },
    select: { aliasSku: true, canonicalSku: true },
  });
  const map: SkuAliasMap = new Map();
  for (const row of rows) {
    map.set(normalizeProductSku(row.aliasSku), normalizeProductSku(row.canonicalSku));
  }
  return map;
}

export async function listAliasesForCanonicalSku(
  organizationId: string,
  canonicalSku: string,
): Promise<string[]> {
  const canonical = normalizeProductSku(canonicalSku);
  if (!canonical) return [];
  const rows = await prisma.productSkuAlias.findMany({
    where: { organizationId, canonicalSku: canonical },
    select: { aliasSku: true },
    orderBy: { aliasSku: "asc" },
  });
  return rows.map((row) => row.aliasSku);
}

export type CreateSkuAliasResult =
  | { ok: true; aliasSku: string; canonicalSku: string }
  | { ok: false; error: string };

export async function createSkuAlias(
  organizationId: string,
  input: {
    canonicalSku: string;
    aliasSku: string;
  },
): Promise<CreateSkuAliasResult> {
  const canonicalSku = normalizeProductSku(input.canonicalSku);
  const aliasSku = normalizeProductSku(input.aliasSku);

  if (!canonicalSku) return { ok: false, error: "SKU canônico inválido" };
  if (!aliasSku) return { ok: false, error: "SKU alias inválido" };
  if (aliasSku === canonicalSku) {
    return { ok: false, error: "O alias não pode ser igual ao SKU canônico" };
  }

  const product = await prisma.product.findUnique({
    where: { organizationId_sku: { organizationId, sku: canonicalSku } },
    select: { sku: true },
  });
  if (!product) {
    return { ok: false, error: "Produto canônico não encontrado" };
  }

  const aliasAsProduct = await prisma.product.findUnique({
    where: { organizationId_sku: { organizationId, sku: aliasSku } },
    select: { sku: true },
  });
  if (aliasAsProduct) {
    return {
      ok: false,
      error:
        "Este SKU já possui cadastro próprio. Remova o cadastro duplicado antes de associá-lo como alias.",
    };
  }

  const existing = await prisma.productSkuAlias.findUnique({
    where: { organizationId_aliasSku: { organizationId, aliasSku } },
    select: { canonicalSku: true },
  });
  if (existing) {
    if (existing.canonicalSku === canonicalSku) {
      return { ok: true, aliasSku, canonicalSku };
    }
    return {
      ok: false,
      error: `Este SKU já está associado a "${existing.canonicalSku}"`,
    };
  }

  await prisma.productSkuAlias.create({
    data: { organizationId, aliasSku, canonicalSku },
  });

  return { ok: true, aliasSku, canonicalSku };
}

export async function deleteSkuAlias(
  organizationId: string,
  input: {
    canonicalSku: string;
    aliasSku: string;
  },
): Promise<boolean> {
  const canonicalSku = normalizeProductSku(input.canonicalSku);
  const aliasSku = normalizeProductSku(input.aliasSku);
  if (!canonicalSku || !aliasSku) return false;

  const result = await prisma.productSkuAlias.deleteMany({
    where: { organizationId, aliasSku, canonicalSku },
  });
  return result.count > 0;
}
