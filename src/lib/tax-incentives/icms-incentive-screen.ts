import {
  countProductsByNcm,
  listIcmsIncentives,
} from "@/lib/tax-incentives/icms-incentive-data";
import type { IcmsIncentiveScreenData } from "@/lib/tax-incentives/types";
import { aliquotaInternaTotal } from "@/lib/tax-report/calculators/icms-difal";
import {
  loadIcmsRatesMap,
  loadTaxCompanyConfig,
} from "@/lib/tax-report/tax-config-data";

/**
 * Incentivos de ICMS da organização + o contexto que a tela precisa: UF da
 * empresa, alíquota interna da tabela dessa UF e o regime (no Simples o
 * incentivo não aparece — o Tributário não roda).
 */
export async function loadIcmsIncentiveScreen(
  organizationId: string,
): Promise<IcmsIncentiveScreenData> {
  const [rules, counts, config, rates] = await Promise.all([
    listIcmsIncentives(organizationId),
    countProductsByNcm(organizationId),
    loadTaxCompanyConfig(organizationId),
    loadIcmsRatesMap(),
  ]);
  const internal = aliquotaInternaTotal(config.originUf, rates) * 100;
  return {
    rules: rules.map((rule) => ({
      ...rule,
      productCount: counts.get(rule.ncm) ?? 0,
    })),
    originUf: config.originUf,
    internalRatePercent: Math.round(internal * 10000) / 10000,
    taxRegime: config.taxRegime,
  };
}
