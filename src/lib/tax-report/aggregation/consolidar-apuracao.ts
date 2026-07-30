import { roundMoney } from "@/lib/financial-margin";
import { icmsSemDifal } from "@/lib/tax-report/calculators/icms-difal";
import type {
  ApuracaoConsolidada,
  DetalhamentoTributario,
} from "@/lib/tax-report/types";

function apuracaoLinha(debito: number, credito: number) {
  const d = roundMoney(debito);
  const c = roundMoney(credito);
  return {
    debito: d,
    credito: c,
    liquido: roundMoney(Math.max(0, d - c)),
  };
}

export function consolidarApuracao(
  transacoes: DetalhamentoTributario[],
): ApuracaoConsolidada {
  const incluidas = transacoes.filter((t) => t.incluidoNaApuracao);

  const pisDebito = incluidas.reduce(
    (s, t) => s + (t.pisCofins?.pisDebito ?? 0),
    0,
  );
  const pisCredito = incluidas.reduce(
    (s, t) => s + (t.pisCofins?.pisCredito ?? 0),
    0,
  );
  const cofinsDebito = incluidas.reduce(
    (s, t) => s + (t.pisCofins?.cofinsDebito ?? 0),
    0,
  );
  const cofinsCredito = incluidas.reduce(
    (s, t) => s + (t.pisCofins?.cofinsCredito ?? 0),
    0,
  );

  const icmsSemDifalDebito = incluidas.reduce(
    (s, t) => s + icmsSemDifal(t.icmsDifal),
    0,
  );
  const difalDebito = incluidas.reduce(
    (s, t) => s + (t.icmsDifal?.difal ?? 0),
    0,
  );
  const icmsDebitoTotal = incluidas.reduce(
    (s, t) => s + (t.icmsDifal?.icmsTotal ?? 0),
    0,
  );
  const icmsCreditoCompra = incluidas.reduce(
    (s, t) => s + (t.icmsCreditoCompra?.creditoTotal ?? 0),
    0,
  );
  const icmsStRecuperavelEstimado = roundMoney(
    incluidas.reduce(
      (s, t) => s + (t.icmsCreditoCompra?.stRecuperavelTotal ?? 0),
      0,
    ),
  );

  const pis = apuracaoLinha(pisDebito, pisCredito);
  const cofins = apuracaoLinha(cofinsDebito, cofinsCredito);
  const pisCofinsLiquido = roundMoney(pis.liquido + cofins.liquido);

  const icmsLiquido = apuracaoLinha(icmsDebitoTotal, icmsCreditoCompra);
  const icmsSemDifalLiquido = apuracaoLinha(
    icmsSemDifalDebito,
    icmsCreditoCompra,
  );

  const difalPorUf: Record<string, number> = {};
  for (const row of incluidas) {
    const uf = row.icmsDifal?.ufDestino;
    const difal = row.icmsDifal?.difal ?? 0;
    if (!uf || difal <= 0) continue;
    difalPorUf[uf] = roundMoney((difalPorUf[uf] ?? 0) + difal);
  }

  const semCusto = incluidas.filter(
    (t) => t.transacao.unitCostNf == null || t.transacao.unitCostNf <= 0,
  );
  const receitaSemCustoCadastrado = roundMoney(
    semCusto.reduce((s, t) => s + t.transacao.receitaBruta, 0),
  );

  const comCusto = incluidas.filter(
    (t) => t.transacao.unitCostNf != null && t.transacao.unitCostNf > 0,
  );
  const debitoComCusto = comCusto.reduce(
    (s, t) => s + (t.pisCofins?.debitoTotal ?? 0),
    0,
  );
  const creditoComCusto = comCusto.reduce(
    (s, t) => s + (t.pisCofins?.creditoTotal ?? 0),
    0,
  );
  const avgCreditRatio =
    debitoComCusto > 0 ? creditoComCusto / debitoComCusto : 0;
  const creditoPisCofinsPerdidoEstimado = roundMoney(
    semCusto.reduce(
      (s, t) => s + (t.pisCofins?.debitoTotal ?? 0) * avgCreditRatio,
      0,
    ),
  );

  return {
    pis,
    cofins,
    pisCofinsLiquido,
    icms: {
      ...icmsLiquido,
      icmsSemDifalDebito: roundMoney(icmsSemDifalDebito),
      difalDebito: roundMoney(difalDebito),
    },
    icmsARecolherSpEstimado: icmsSemDifalLiquido.liquido,
    difalARecolherEstimado: roundMoney(difalDebito),
    difalPorUf,
    icmsStRecuperavelEstimado,
    diagnostico: {
      receitaSemCustoCadastrado,
      linhasSemCustoCadastrado: semCusto.length,
      creditoPisCofinsPerdidoEstimado,
    },
  };
}
