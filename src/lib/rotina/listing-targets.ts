import { prisma } from "@/lib/db/db";
import { decimalToNumber } from "@/lib/catalog-report/catalog-competition";
import type { ListingTargetValues } from "@/lib/rotina/types";

/** Metas por anúncio (exceção ao padrão do segmento). */
export async function loadListingTargets(
  organizationId: string,
): Promise<Map<string, ListingTargetValues>> {
  const rows = await prisma.listingTarget.findMany({
    where: { organizationId },
    select: { mlItemId: true, minMarginPercent: true, tacosTargetPercent: true },
  });
  return new Map(
    rows.map((row) => [
      row.mlItemId,
      {
        minMarginPercent: decimalToNumber(row.minMarginPercent),
        tacosTargetPercent: decimalToNumber(row.tacosTargetPercent),
      },
    ]),
  );
}

export class ListingTargetConflictError extends Error {
  constructor() {
    super("listing_target_conflict");
  }
}

/**
 * Grava (ou apaga, com as duas metas nulas) a exceção de um anúncio. A chave é
 * o `mlItemId`, 1:1 com a organização — a checagem de dono existe porque
 * `upsert` por chave primária não filtra por organização.
 */
export async function saveListingTarget(
  organizationId: string,
  mlItemId: string,
  values: ListingTargetValues,
): Promise<ListingTargetValues | null> {
  const existing = await prisma.listingTarget.findUnique({
    where: { mlItemId },
    select: { organizationId: true },
  });
  if (existing && existing.organizationId !== organizationId) {
    throw new ListingTargetConflictError();
  }

  if (values.minMarginPercent === null && values.tacosTargetPercent === null) {
    if (existing) await prisma.listingTarget.delete({ where: { mlItemId } });
    return null;
  }

  await prisma.listingTarget.upsert({
    where: { mlItemId },
    create: { mlItemId, organizationId, ...values },
    update: values,
  });
  return values;
}

/** O anúncio é desta organização (já passou por uma rodada ou pelo cron de catálogo). */
export async function listingBelongsToOrganization(
  organizationId: string,
  mlItemId: string,
): Promise<boolean> {
  const [health, listing] = await Promise.all([
    prisma.listingHealth.count({ where: { organizationId, mlItemId } }),
    prisma.listing.count({ where: { organizationId, mlItemId } }),
  ]);
  return health + listing > 0;
}
