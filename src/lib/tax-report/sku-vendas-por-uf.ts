import { roundMoney } from "@/lib/financial-margin";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

export type SkuVendaPorUf = {
  uf: string;
  quantidadeVendas: number;
  unidadesVendidas: number;
  receitaTotal: number;
  percentualReceita: number;
};

const SEM_UF_LABEL = "Sem UF";

function ufLabel(uf: string | null | undefined): string {
  const trimmed = uf?.trim().toUpperCase();
  return trimmed || SEM_UF_LABEL;
}

export function calcularSkuVendasPorUf(
  transacoes: DetalhamentoTributario[],
): SkuVendaPorUf[] {
  const map = new Map<
    string,
    Omit<SkuVendaPorUf, "percentualReceita">
  >();

  for (const row of transacoes) {
    const uf = ufLabel(row.transacao.ufDestino);
    const existing = map.get(uf) ?? {
      uf,
      quantidadeVendas: 0,
      unidadesVendidas: 0,
      receitaTotal: 0,
    };

    existing.quantidadeVendas += 1;
    existing.unidadesVendidas += row.transacao.quantidade;
    existing.receitaTotal = roundMoney(
      existing.receitaTotal + row.transacao.receitaBruta,
    );
    map.set(uf, existing);
  }

  const receitaBase = roundMoney(
    [...map.values()].reduce((sum, row) => sum + row.receitaTotal, 0),
  );

  return [...map.values()]
    .map((row) => ({
      ...row,
      receitaTotal: roundMoney(row.receitaTotal),
      percentualReceita:
        receitaBase > 0
          ? roundMoney((row.receitaTotal / receitaBase) * 100)
          : 0,
    }))
    .sort((a, b) => {
      if (b.percentualReceita !== a.percentualReceita) {
        return b.percentualReceita - a.percentualReceita;
      }
      return a.uf.localeCompare(b.uf, "pt-BR");
    });
}

export function skuVendaPorUfFilterValue(uf: string): string {
  return uf === SEM_UF_LABEL ? "" : uf;
}
