import { normalizeNcm } from "@/lib/tax-incentives/ncm";
import type {
  IcmsIncentiveIndex,
  IcmsIncentiveRule,
  IcmsIncentivoVenda,
} from "@/lib/tax-incentives/types";

/** A regra vale no dia (`YYYY-MM-DD`, inclusive nas duas pontas)? */
export function isIcmsIncentiveValidOn(
  rule: Pick<IcmsIncentiveRule, "validFrom" | "validTo">,
  ymd: string,
): boolean {
  if (rule.validFrom && ymd < rule.validFrom) return false;
  if (rule.validTo && ymd > rule.validTo) return false;
  return true;
}

/**
 * Incentivo de ICMS para a venda de um produto: a regra do NCM do produto, se
 * o produto não foi marcado "não se aplica" e a venda cai na vigência. Não
 * olha UF nem comprador — isso é do cálculo do ICMS (`icms-difal.ts`).
 */
export function resolveIcmsIncentive(input: {
  index: IcmsIncentiveIndex | undefined;
  ncm: string | null | undefined;
  excluded: boolean | undefined;
  /** Dia da venda (`YYYY-MM-DD`, fuso de São Paulo); null = venda sem data. */
  orderDateYmd: string | null;
}): IcmsIncentivoVenda | null {
  if (!input.index || input.index.size === 0 || input.excluded) return null;
  const ncm = normalizeNcm(input.ncm);
  if (!ncm) return null;
  const rule = input.index.get(ncm);
  if (!rule) return null;
  if (input.orderDateYmd == null) {
    // Sem data não dá para conferir a vigência: só vale regra sem datas.
    if (rule.validFrom || rule.validTo) return null;
  } else if (!isIcmsIncentiveValidOn(rule, input.orderDateYmd)) {
    return null;
  }
  return {
    ncm,
    aliquotaPercent: rule.ratePercent,
    appliesTo: rule.appliesTo,
  };
}

/** O incentivo vale para este comprador? (`contribuinte` = só B2B). */
export function icmsIncentiveAppliesToBuyer(
  incentivo: Pick<IcmsIncentivoVenda, "appliesTo">,
  buyerIsContribuinte: boolean,
): boolean {
  return incentivo.appliesTo === "all" || buyerIsContribuinte;
}
