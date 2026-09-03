import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  impostoOperacionalConsolidado,
  skuImpostoOperacionalPercentual,
} from "@/lib/tax-report/imposto-operacional";
import {
  generateMonthlyTaxReport,
  type GenerateMonthlyReportProgress,
} from "@/lib/tax-report/service/generate-monthly-report";
import { loadTaxCompanyConfig } from "@/lib/tax-report/tax-config-data";
import type { TaxReportPayload } from "@/lib/tax-report/types";
import type {
  SimulacaoComparacao,
  SimulacaoSkuComparacao,
} from "@/lib/simples-nacional/types";

/**
 * Roda o motor de apuração do Lucro Real sobre os dados reais do mês de uma
 * empresa Simples — só para comparação, nunca persiste em
 * `CompanyTaxSettings`. Overrides fixados aqui, nunca repassados de um
 * request — ver `GenerationOverrides` em `generateMonthlyTaxReport`:
 *
 * - `forceRegime: "LUCRO_REAL"` — passa pelo gate do motor.
 * - `forceConsiderIcmsStRecuperavel: false` — uma empresa que sempre foi
 *   Simples nunca passou pela tela de Configurações tributárias (só
 *   visível/aplicável em Lucro Real), então `considerIcmsStRecuperavel` no
 *   banco é o default de fábrica, nunca calibrado por ela. Sem isso, a
 *   simulação creditaria uma tese (Tema 201/STF) que a empresa nunca
 *   levantou/aplicou, superestimando a vantagem do Lucro Real.
 * - `forceExcludeIcmsFromPisCofinsBase: true` — mesmo motivo, mas aqui é
 *   jurisprudência pacificada (RE 574.706/STF), não uma tese discutível;
 *   força o valor correto em vez de depender do que porventura esteja
 *   configurado no banco de uma empresa que nunca precisou mexer nisso.
 */
export async function simulateLucroRealForMonth(input: {
  accessToken: string;
  sellerId: number;
  organizationId: string;
  year: number;
  month: number;
  onProgress?: (progress: GenerateMonthlyReportProgress) => void;
}): Promise<TaxReportPayload> {
  return generateMonthlyTaxReport({
    accessToken: input.accessToken,
    sellerId: input.sellerId,
    organizationId: input.organizationId,
    year: input.year,
    month: input.month,
    onProgress: input.onProgress,
    forceRegime: "LUCRO_REAL",
    forceConsiderIcmsStRecuperavel: false,
    forceExcludeIcmsFromPisCofinsBase: true,
  });
}

/**
 * Compara o payload simulado (Lucro Real) contra o DAS efetivamente pago
 * (alíquota efetiva manual real da org × faturamento do próprio payload
 * simulado — não busca receita em outra fonte). Comparação parcial: só
 * tributos operacionais (PIS/COFINS + ICMS/DIFAL), sem IRPJ/CSLL — ver
 * disclaimer na UI.
 *
 * Inclui `porSku`: o % efetivo de Lucro Real varia por produto (crédito de
 * compra, ICMS-ST, frete etc. são específicos de cada SKU); o % do Simples é
 * sempre `simplesAliquotaEfetivaPercent` — o DAS não discrimina por anúncio.
 */
export async function compararSimplesXLucroReal(
  organizationId: string,
  payload: TaxReportPayload,
): Promise<SimulacaoComparacao> {
  const config = await loadTaxCompanyConfig(organizationId);
  const simplesAliquotaEfetivaPercent = config.simplesAliquotaEfetivaPercent ?? 0;
  const faturamento = payload.consolidado.faturamento;
  const dasPago = roundMoney(faturamento * (simplesAliquotaEfetivaPercent / 100));
  const impostoOperacionalSimulado = impostoOperacionalConsolidado(
    payload.consolidado,
  );

  const porSku: SimulacaoSkuComparacao[] = payload.porSku.map((sku) => {
    const lucroRealPercent = skuImpostoOperacionalPercentual(sku);
    return {
      sku: sku.sku,
      mlItemId: sku.mlItemId,
      receitaTotal: sku.receitaTotal,
      lucroRealPercent,
      diferencaPercent: roundMoney(
        simplesAliquotaEfetivaPercent - lucroRealPercent,
      ),
    };
  });

  return {
    year: payload.year,
    month: payload.month,
    faturamento,
    dasPago,
    impostoOperacionalSimulado,
    diferenca: roundMoney(dasPago - impostoOperacionalSimulado),
    simplesAliquotaEfetivaPercent,
    porSku,
  };
}
