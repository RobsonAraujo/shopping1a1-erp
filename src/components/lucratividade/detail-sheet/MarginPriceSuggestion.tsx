"use client";

import { Target } from "lucide-react";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  marginBasisLabel,
  type MarginBasis,
} from "@/lib/pricing/financial-margin";
import { estimateMinPriceForTarget } from "@/lib/lucratividade/target-margin";
import type { LiveListingRowState } from "@/components/lucratividade/hooks/useLiveListingRow";

/**
 * "Preço p/ meta" do anúncio, sempre no preço de HOJE (linha ao vivo, com
 * taxa e frete consultados no ML no preço sugerido).
 */
export function MarginPriceSuggestion({
  live,
  targetMarginPercent,
  marginBasis,
}: {
  live: LiveListingRowState;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
}) {
  const targetLabel = `${formatFinancialPercent(targetMarginPercent)} de ${marginBasisLabel(marginBasis)}`;

  let body: React.ReactNode;
  if (live.status === "loading") {
    body = (
      <div className="space-y-2" aria-label="Consultando o preço de hoje no ML">
        <div className="h-4 w-full max-w-sm animate-pulse rounded bg-[var(--muted)]" />
        <div className="h-3 w-48 animate-pulse rounded bg-[var(--muted)]" />
      </div>
    );
  } else if (live.status === "not_operational") {
    body = (
      <p className="text-sm text-[var(--muted-foreground)]">
        Anúncio não está ativo nem pausado no Mercado Livre — sem preço de hoje
        para calcular.
      </p>
    );
  } else if (live.status === "error") {
    body = <UserFeedback>{live.message}</UserFeedback>;
  } else {
    const row = live.row;
    const result =
      row.minSalePriceForTarget ??
      estimateMinPriceForTarget(row, targetMarginPercent, marginBasis);
    const refined = Boolean(row.minSalePriceForTarget && row.minSalePriceRefined);

    if (result.reason === "missing_product_cost") {
      body = (
        <p className="text-sm text-amber-800">
          Cadastre o custo em Meus produtos para calcular o preço mínimo.
        </p>
      );
    } else if (result.reason === "impossible") {
      body = (
        <p className="text-sm text-rose-700">
          Com os custos atuais, nenhum preço atinge {targetLabel}.
        </p>
      );
    } else if (result.minSalePrice === null) {
      body = (
        <p className="text-sm text-[var(--muted-foreground)]">
          Dados insuficientes para sugerir um preço.
        </p>
      );
    } else {
      const delta = result.minSalePrice - row.salePrice;
      const meets = result.alreadyMeetsTarget || delta <= 0.005;
      body = (
        <div className="space-y-1">
          <p className="text-sm">
            Para ter {targetLabel}, venda a partir de{" "}
            <span className="font-semibold tabular-nums">
              {formatFinancialMoney(result.minSalePrice)}
            </span>
            .
          </p>
          <p
            className={
              meets ? "text-sm text-emerald-700" : "text-sm text-amber-800"
            }
          >
            Hoje: {formatFinancialMoney(row.salePrice)}
            {result.currentMarginPercent !== null
              ? ` (${formatFinancialPercent(result.currentMarginPercent)})`
              : ""}
            {meets
              ? " — já atinge a meta."
              : ` — faltam ${formatFinancialMoney(delta)} por unidade.`}
          </p>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {refined
              ? "Taxa ML e frete consultados no Mercado Livre nesse preço."
              : "Estimativa com taxa ML proporcional ao preço."}
          </p>
        </div>
      );
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Target className="size-4 text-[var(--primary)]" aria-hidden />
        Preço p/ meta
        <span className="font-normal text-[var(--muted-foreground)]">
          · no preço de hoje
        </span>
      </p>
      {body}
    </section>
  );
}
