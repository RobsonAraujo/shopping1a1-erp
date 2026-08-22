import { prisma } from "@/lib/db";
import {
  DEFAULT_COFINS_RATE,
  DEFAULT_IRPJ_ADDITIONAL_THRESHOLD,
  DEFAULT_ORIGIN_UF,
  DEFAULT_PIS_RATE,
} from "@/lib/tax-report/config";
import type {
  IcmsRateRow,
  TaxCompanyConfig,
} from "@/lib/tax-report/types";
import type { CbsIbsVigenciaRow } from "@/lib/tax-report/calculators/cbs-ibs";

function decimalToNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function loadTaxCompanyConfig(
  organizationId: string,
): Promise<TaxCompanyConfig> {
  const row = await prisma.companyTaxSettings.findUnique({
    where: { organizationId },
  });

  return {
    taxRegime: (row?.taxRegime as TaxCompanyConfig["taxRegime"]) ?? "LUCRO_REAL",
    originUf: row?.originUf ?? DEFAULT_ORIGIN_UF,
    pisRatePercent: row ? decimalToNumber(row.pisRatePercent) : DEFAULT_PIS_RATE,
    cofinsRatePercent: row
      ? decimalToNumber(row.cofinsRatePercent)
      : DEFAULT_COFINS_RATE,
    excludeIcmsFromPisCofinsBase: row?.excludeIcmsFromPisCofinsBase ?? true,
    considerIcmsStRecuperavel: row?.considerIcmsStRecuperavel ?? true,
    simplesAliquotaEfetivaPercent:
      row?.simplesAliquotaEfetivaPercent != null
        ? decimalToNumber(row.simplesAliquotaEfetivaPercent)
        : null,
  };
}

export async function loadIcmsRatesMap(): Promise<Map<string, IcmsRateRow>> {
  const rows = await prisma.icmsInternalRate.findMany();
  const map = new Map<string, IcmsRateRow>();
  for (const row of rows) {
    map.set(row.uf, {
      uf: row.uf,
      aliquotaBase: decimalToNumber(row.aliquotaBase),
      fcp: decimalToNumber(row.fcp),
    });
  }
  return map;
}

export async function loadCbsIbsVigencia(
  year: number,
): Promise<CbsIbsVigenciaRow | null> {
  const row = await prisma.cbsIbsVigencia.findUnique({ where: { year } });
  if (!row) return null;
  return {
    year: row.year,
    cbsRate: row.cbsRate != null ? decimalToNumber(row.cbsRate) : null,
    ibsEstadualRate:
      row.ibsEstadualRate != null ? decimalToNumber(row.ibsEstadualRate) : null,
    ibsMunicipalRate:
      row.ibsMunicipalRate != null
        ? decimalToNumber(row.ibsMunicipalRate)
        : null,
    notes: row.notes,
  };
}

export type TaxConfigUpdateInput = {
  taxRegime?: TaxCompanyConfig["taxRegime"];
  originUf?: string;
  pisRatePercent?: number;
  cofinsRatePercent?: number;
  excludeIcmsFromPisCofinsBase?: boolean;
  considerIcmsStRecuperavel?: boolean;
  irpjAdditionalThreshold?: number;
  simplesAliquotaEfetivaPercent?: number | null;
};

export async function updateTaxCompanyConfig(
  organizationId: string,
  input: TaxConfigUpdateInput,
): Promise<TaxCompanyConfig> {
  const current = await prisma.companyTaxSettings.findUnique({
    where: { organizationId },
  });
  const nextPis =
    input.pisRatePercent ??
    (current ? decimalToNumber(current.pisRatePercent) : DEFAULT_PIS_RATE);
  const nextCofins =
    input.cofinsRatePercent ??
    (current ? decimalToNumber(current.cofinsRatePercent) : DEFAULT_COFINS_RATE);
  const syncPisCofins =
    input.pisRatePercent !== undefined || input.cofinsRatePercent !== undefined;

  const row = await prisma.companyTaxSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      pisCofinsPercent: nextPis + nextCofins,
      taxRegime: input.taxRegime ?? "LUCRO_REAL",
      originUf: input.originUf ?? DEFAULT_ORIGIN_UF,
      pisRatePercent: nextPis,
      cofinsRatePercent: nextCofins,
      excludeIcmsFromPisCofinsBase: input.excludeIcmsFromPisCofinsBase ?? true,
      considerIcmsStRecuperavel: input.considerIcmsStRecuperavel ?? true,
      irpjAdditionalThreshold:
        input.irpjAdditionalThreshold ?? DEFAULT_IRPJ_ADDITIONAL_THRESHOLD,
      simplesAliquotaEfetivaPercent: input.simplesAliquotaEfetivaPercent ?? null,
    },
    update: {
      ...(input.taxRegime !== undefined ? { taxRegime: input.taxRegime } : {}),
      ...(input.originUf !== undefined ? { originUf: input.originUf } : {}),
      ...(syncPisCofins
        ? {
            pisRatePercent: nextPis,
            cofinsRatePercent: nextCofins,
            pisCofinsPercent: nextPis + nextCofins,
          }
        : {}),
      ...(input.excludeIcmsFromPisCofinsBase !== undefined
        ? { excludeIcmsFromPisCofinsBase: input.excludeIcmsFromPisCofinsBase }
        : {}),
      ...(input.considerIcmsStRecuperavel !== undefined
        ? { considerIcmsStRecuperavel: input.considerIcmsStRecuperavel }
        : {}),
      ...(input.irpjAdditionalThreshold !== undefined
        ? { irpjAdditionalThreshold: input.irpjAdditionalThreshold }
        : {}),
      ...(input.simplesAliquotaEfetivaPercent !== undefined
        ? { simplesAliquotaEfetivaPercent: input.simplesAliquotaEfetivaPercent }
        : {}),
    },
  });

  return {
    taxRegime: row.taxRegime as TaxCompanyConfig["taxRegime"],
    originUf: row.originUf,
    pisRatePercent: decimalToNumber(row.pisRatePercent),
    cofinsRatePercent: decimalToNumber(row.cofinsRatePercent),
    excludeIcmsFromPisCofinsBase: row.excludeIcmsFromPisCofinsBase,
    considerIcmsStRecuperavel: row.considerIcmsStRecuperavel,
    simplesAliquotaEfetivaPercent:
      row.simplesAliquotaEfetivaPercent != null
        ? decimalToNumber(row.simplesAliquotaEfetivaPercent)
        : null,
  };
}

export async function upsertIcmsInternalRate(input: IcmsRateRow): Promise<void> {
  await prisma.icmsInternalRate.upsert({
    where: { uf: input.uf },
    create: {
      uf: input.uf,
      aliquotaBase: input.aliquotaBase,
      fcp: input.fcp,
    },
    update: {
      aliquotaBase: input.aliquotaBase,
      fcp: input.fcp,
    },
  });
}

export async function listIcmsInternalRates(): Promise<IcmsRateRow[]> {
  const rows = await prisma.icmsInternalRate.findMany({ orderBy: { uf: "asc" } });
  return rows.map((row) => ({
    uf: row.uf,
    aliquotaBase: decimalToNumber(row.aliquotaBase),
    fcp: decimalToNumber(row.fcp),
  }));
}

export async function upsertCbsIbsVigencia(
  input: CbsIbsVigenciaRow,
): Promise<void> {
  await prisma.cbsIbsVigencia.upsert({
    where: { year: input.year },
    create: {
      year: input.year,
      cbsRate: input.cbsRate,
      ibsEstadualRate: input.ibsEstadualRate,
      ibsMunicipalRate: input.ibsMunicipalRate,
      notes: input.notes,
    },
    update: {
      cbsRate: input.cbsRate,
      ibsEstadualRate: input.ibsEstadualRate,
      ibsMunicipalRate: input.ibsMunicipalRate,
      notes: input.notes,
    },
  });
}

export async function listCbsIbsVigencia(): Promise<CbsIbsVigenciaRow[]> {
  const rows = await prisma.cbsIbsVigencia.findMany({ orderBy: { year: "asc" } });
  return rows.map((row) => ({
    year: row.year,
    cbsRate: row.cbsRate != null ? decimalToNumber(row.cbsRate) : null,
    ibsEstadualRate:
      row.ibsEstadualRate != null ? decimalToNumber(row.ibsEstadualRate) : null,
    ibsMunicipalRate:
      row.ibsMunicipalRate != null ? decimalToNumber(row.ibsMunicipalRate) : null,
    notes: row.notes,
  }));
}
