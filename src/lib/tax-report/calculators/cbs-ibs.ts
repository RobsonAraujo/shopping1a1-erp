import { roundMoney } from "@/lib/financial-margin";
import type { CbsIbsInformativo } from "@/lib/tax-report/types";

export type CbsIbsVigenciaRow = {
  year: number;
  cbsRate: number | null;
  ibsEstadualRate: number | null;
  ibsMunicipalRate: number | null;
  notes: string | null;
};

export function calcularCbsIbsInformativo(
  receitaBruta: number,
  year: number,
  vigencia: CbsIbsVigenciaRow | null,
): CbsIbsInformativo | null {
  if (!vigencia) return null;

  const cbsRate = vigencia.cbsRate;
  const ibsEstadual = vigencia.ibsEstadualRate ?? 0;
  const ibsMunicipal = vigencia.ibsMunicipalRate ?? 0;

  const valorCbs =
    cbsRate != null ? roundMoney(receitaBruta * cbsRate) : null;
  const ibsTotalRate = ibsEstadual + ibsMunicipal;
  const valorIbs =
    ibsTotalRate > 0 ? roundMoney(receitaBruta * ibsTotalRate) : null;

  return {
    year,
    cbs: cbsRate,
    ibsEstadual: vigencia.ibsEstadualRate,
    ibsMunicipal: vigencia.ibsMunicipalRate,
    valorCbs,
    valorIbs,
    notes: vigencia.notes,
  };
}
