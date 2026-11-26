import { prisma } from "@/lib/db/db";
import { normalizeNcm } from "@/lib/tax-incentives/ncm";
import type {
  IcmsIncentiveAppliesTo,
  IcmsIncentiveIndex,
  IcmsIncentiveRule,
} from "@/lib/tax-incentives/types";

type IcmsIncentiveRow = {
  ncm: string;
  ratePercent: unknown;
  appliesTo: IcmsIncentiveAppliesTo;
  validFrom: Date | null;
  validTo: Date | null;
  note: string | null;
  updatedAt: Date;
};

/** Coluna `@db.Date` volta como meia-noite UTC: o dia é a parte da data ISO. */
function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function ymdToDate(ymd: string | null): Date | null {
  return ymd ? new Date(`${ymd}T00:00:00.000Z`) : null;
}

export function icmsIncentiveFromRow(row: IcmsIncentiveRow): IcmsIncentiveRule {
  const rate = Number(row.ratePercent);
  return {
    ncm: row.ncm,
    ratePercent: Number.isFinite(rate) ? rate : 0,
    appliesTo: row.appliesTo,
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listIcmsIncentives(
  organizationId: string,
): Promise<IcmsIncentiveRule[]> {
  const rows = await prisma.icmsIncentive.findMany({
    where: { organizationId },
    orderBy: { ncm: "asc" },
  });
  return rows.map(icmsIncentiveFromRow);
}

export async function loadIcmsIncentiveIndex(
  organizationId: string,
): Promise<IcmsIncentiveIndex> {
  const rules = await listIcmsIncentives(organizationId);
  return new Map(rules.map((rule) => [rule.ncm, rule]));
}

/**
 * Produtos da organização com o NCM (normalizado). O cadastro guarda o NCM
 * como foi digitado, então a comparação é feita aqui, não no `where`.
 */
export async function listProductIdsByNcm(
  organizationId: string,
  ncm: string,
): Promise<string[]> {
  const target = normalizeNcm(ncm);
  if (!target) return [];
  const rows = await prisma.product.findMany({
    where: { organizationId, ncm: { not: null } },
    select: { mlItemId: true, ncm: true },
  });
  return rows
    .filter((row) => normalizeNcm(row.ncm) === target)
    .map((row) => row.mlItemId);
}

/** Quantos produtos da organização usam cada NCM (normalizado). */
export async function countProductsByNcm(
  organizationId: string,
): Promise<Map<string, number>> {
  const rows = await prisma.product.findMany({
    where: { organizationId, ncm: { not: null } },
    select: { ncm: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const ncm = normalizeNcm(row.ncm);
    if (ncm) counts.set(ncm, (counts.get(ncm) ?? 0) + 1);
  }
  return counts;
}

export type IcmsIncentiveWriteInput = {
  ncm: string;
  ratePercent: number;
  appliesTo: IcmsIncentiveAppliesTo;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
};

export type IcmsIncentiveProductExclusion = {
  mlItemId: string;
  excluded: boolean;
};

export class IcmsIncentiveInputError extends Error {}

export function validateIcmsIncentiveInput(
  input: IcmsIncentiveWriteInput,
): string | null {
  if (!normalizeNcm(input.ncm)) return "NCM precisa ter 8 dígitos";
  if (
    !Number.isFinite(input.ratePercent) ||
    input.ratePercent < 0 ||
    input.ratePercent > 100
  ) {
    return "O ICMS da venda interna precisa estar entre 0% e 100%";
  }
  if (input.validFrom && input.validTo && input.validTo < input.validFrom) {
    return "A data final da vigência é anterior à inicial";
  }
  return null;
}

/**
 * Separa o "não se aplica" vindo da tela em ligar/desligar, descartando
 * produto que não é da organização ou não tem o NCM (`allowedIds`).
 */
export function splitIncentiveExclusions(
  allowedIds: ReadonlySet<string>,
  exclusions: readonly IcmsIncentiveProductExclusion[],
): { excludedIds: string[]; includedIds: string[] } {
  const excludedIds: string[] = [];
  const includedIds: string[] = [];
  for (const e of exclusions) {
    if (!allowedIds.has(e.mlItemId)) continue;
    (e.excluded ? excludedIds : includedIds).push(e.mlItemId);
  }
  return { excludedIds, includedIds };
}

/**
 * Grava a regra do NCM e o "não se aplica" dos produtos informados. Só mexe
 * em produto da organização que tem esse NCM — o resto é ignorado.
 */
export async function upsertIcmsIncentive(
  organizationId: string,
  input: IcmsIncentiveWriteInput,
  exclusions: readonly IcmsIncentiveProductExclusion[] = [],
): Promise<IcmsIncentiveRule> {
  const error = validateIcmsIncentiveInput(input);
  if (error) throw new IcmsIncentiveInputError(error);
  const ncm = normalizeNcm(input.ncm) as string;
  const data = {
    ratePercent: input.ratePercent,
    appliesTo: input.appliesTo,
    validFrom: ymdToDate(input.validFrom),
    validTo: ymdToDate(input.validTo),
    note: input.note?.trim() || null,
  };
  const row = await prisma.icmsIncentive.upsert({
    where: { organizationId_ncm: { organizationId, ncm } },
    create: { organizationId, ncm, ...data },
    update: data,
  });

  if (exclusions.length > 0) {
    const allowed = new Set(await listProductIdsByNcm(organizationId, ncm));
    const { excludedIds, includedIds } = splitIncentiveExclusions(allowed, exclusions);
    if (excludedIds.length > 0) {
      await prisma.product.updateMany({
        where: { organizationId, mlItemId: { in: excludedIds } },
        data: { icmsIncentiveExcluded: true },
      });
    }
    if (includedIds.length > 0) {
      await prisma.product.updateMany({
        where: { organizationId, mlItemId: { in: includedIds } },
        data: { icmsIncentiveExcluded: false },
      });
    }
  }
  return icmsIncentiveFromRow(row);
}

/** Apaga a regra do NCM e limpa o "não se aplica" dos produtos dele. */
export async function deleteIcmsIncentive(
  organizationId: string,
  ncmRaw: string,
): Promise<boolean> {
  const ncm = normalizeNcm(ncmRaw);
  if (!ncm) return false;
  const { count } = await prisma.icmsIncentive.deleteMany({
    where: { organizationId, ncm },
  });
  const ids = await listProductIdsByNcm(organizationId, ncm);
  if (ids.length > 0) {
    await prisma.product.updateMany({
      where: { organizationId, mlItemId: { in: ids }, icmsIncentiveExcluded: true },
      data: { icmsIncentiveExcluded: false },
    });
  }
  return count > 0;
}
