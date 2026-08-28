import { roundMoney } from "@/lib/financial-margin";
import {
  ANEXO_I_FAIXAS,
  SIMPLES_SUBLIMITE_RBT12,
  SIMPLES_TETO_RBT12,
} from "@/lib/simples-nacional/anexo-i-table";
import type {
  AnexoComposicaoPercentual,
  AnexoFaixa,
} from "@/lib/simples-nacional/types";
import type { StatusTone } from "@/lib/ui/tone";

/** Faixa do Anexo I cujo intervalo [rbt12Min, rbt12Max] contém o RBT12 informado. */
export function encontrarFaixaPorRbt12(rbt12: number): AnexoFaixa {
  const clamped = Math.max(0, rbt12);
  const faixa = ANEXO_I_FAIXAS.find(
    (f) => clamped >= f.rbt12Min && clamped <= f.rbt12Max,
  );
  return faixa ?? ANEXO_I_FAIXAS[ANEXO_I_FAIXAS.length - 1];
}

/**
 * Alíquota efetiva nominal da faixa: ((RBT12 × alíquota) − parcela a deduzir) / RBT12.
 * Só informativa — para comparar com a alíquota efetiva manual configurada
 * (`CompanyTaxSettings.simplesAliquotaEfetivaPercent`), que segue sendo a
 * fonte usada no cálculo real do DAS pago (ver README).
 */
export function calcularAliquotaEfetivaNominal(
  rbt12: number,
  faixa: AnexoFaixa,
): number {
  if (rbt12 <= 0) return faixa.aliquotaNominalPercent;
  const aliquotaEfetiva =
    ((rbt12 * (faixa.aliquotaNominalPercent / 100) - faixa.parcelaDeduzir) /
      rbt12) *
    100;
  return roundMoney(Math.max(0, aliquotaEfetiva));
}

/** Quebra o valor do DAS de um mês pelos percentuais estáticos da faixa. */
export function calcularComposicaoDas(
  valorDasMes: number,
  faixa: AnexoFaixa,
): Record<keyof AnexoComposicaoPercentual, number> {
  const { composicaoPercentual } = faixa;
  const entries = Object.entries(composicaoPercentual) as Array<
    [keyof AnexoComposicaoPercentual, number]
  >;
  return Object.fromEntries(
    entries.map(([tributo, percent]) => [
      tributo,
      roundMoney(valorDasMes * (percent / 100)),
    ]),
  ) as Record<keyof AnexoComposicaoPercentual, number>;
}

/** Alerta de proximidade de mudança de faixa, sublimite (R$3,6M) ou teto (R$4,8M) do Simples. */
export function avaliarProximidadeLimite(rbt12: number): {
  tone: StatusTone;
  mensagem: string;
} {
  if (rbt12 > SIMPLES_TETO_RBT12) {
    return {
      tone: "danger",
      mensagem:
        "RBT12 ultrapassou o teto do Simples Nacional (R$ 4.800.000,00) — risco de exclusão do regime.",
    };
  }
  if (rbt12 > SIMPLES_SUBLIMITE_RBT12) {
    return {
      tone: "warning",
      mensagem:
        "RBT12 acima do sublimite (R$ 3.600.000,00) — ICMS/ISS já devem ser recolhidos por fora do DAS.",
    };
  }

  const faixa = encontrarFaixaPorRbt12(rbt12);
  const restanteParaProximaFaixa = faixa.rbt12Max - rbt12;
  const restanteParaSublimite = SIMPLES_SUBLIMITE_RBT12 - rbt12;
  const limiteProximo = Math.min(
    faixa.rbt12Max < SIMPLES_TETO_RBT12 ? restanteParaProximaFaixa : Infinity,
    restanteParaSublimite,
  );

  // "Perto" = falta menos de 10% da faixa atual (ou do sublimite) para estourar.
  const margemFaixa = faixa.rbt12Max - faixa.rbt12Min;
  if (limiteProximo <= margemFaixa * 0.1 || limiteProximo <= 50_000) {
    return {
      tone: "warning",
      mensagem: `Faltam ${roundMoney(Math.max(0, limiteProximo)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de RBT12 para a próxima faixa ou o sublimite.`,
    };
  }

  return { tone: "ok", mensagem: `Faixa ${faixa.faixa} do Anexo I — dentro da margem.` };
}
