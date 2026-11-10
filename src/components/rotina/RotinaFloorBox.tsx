"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatPercent } from "@/lib/rotina/format";
import type { RotinaFloorView } from "@/lib/rotina/floor-view";
import { cn } from "@/lib/utils";

function moneyOrDash(value: number | null): string {
  return value === null ? "—" : formatMoney(value);
}

const REASON_TEXT: Record<RotinaFloorView["reason"], string> = {
  ok: "",
  missing_product_cost: "Sem custo cadastrado: não dá para calcular o preço mínimo.",
  impossible: "Nem com preço alto a margem mínima fecha: revise custo ou meta.",
  incomplete: "Faltam dados (alíquota ou composição do kit) para calcular o mínimo.",
  not_computed: "Preço mínimo ainda não calculado: clique em Atualizar.",
};

/**
 * "Até onde dá para ir" de uma ação. Mostra o piso que vale (margem após ADS ou
 * PMA), os dois mínimos (após ADS e MC), o desconto máximo para promoção e as
 * faixas de preço a evitar.
 */
export function RotinaFloorBox({
  floor,
  showDiscount,
  onRecalculate,
  recalculateDisabled,
}: {
  floor: RotinaFloorView;
  showDiscount: boolean;
  onRecalculate?: () => void;
  recalculateDisabled?: boolean;
}) {
  if (floor.effectivePrice === null) {
    return (
      <p className="mt-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
        {REASON_TEXT[floor.reason] || REASON_TEXT.not_computed}
      </p>
    );
  }

  const target = formatPercent(floor.targetPercent);

  return (
    <div className="mt-2 space-y-1 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[var(--muted-foreground)]">
          Mínimo p/ {target}:{" "}
          <strong className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(floor.effectivePrice)}
          </strong>
          {floor.boundBy === "pma" ? " (é o seu PMA)" : null}
        </span>
        {showDiscount && floor.maxDiscountPercent !== null && floor.discountBase !== null ? (
          <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)]">
            desconto máx.{" "}
            <strong className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
              {floor.maxDiscountPercent}%
            </strong>{" "}
            sobre {formatMoney(floor.discountBase)}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="cursor-pointer text-[var(--muted-foreground)]/70 hover:text-[var(--foreground)]"
                  aria-label="Sobre o desconto máximo"
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Desconto inteiro sobre o preço original sem passar do mínimo. Não
                considera co-participação do Mercado Livre na campanha: se o ML
                bancar parte do desconto, sobra mais margem.
              </TooltipContent>
            </Tooltip>
          </span>
        ) : null}
      </div>
      <p className="tabular-nums text-[var(--muted-foreground)]">
        Após ADS {moneyOrDash(floor.afterAdsPrice)} · MC {moneyOrDash(floor.mcPrice)}
        {floor.afterAdsMissing === "ads_unavailable"
          ? " · ADS indisponível: vale o da MC"
          : floor.afterAdsMissing === "spend_without_sales"
            ? " · ADS gastando sem vender: vale o da MC"
            : null}
      </p>
      {floor.bands.map((band) => (
        <p key={`${band.from}-${band.to}`} className="text-amber-800">
          Evite {formatMoney(band.from)} a {formatMoney(band.to)}: nessa faixa o
          frete passa a ser seu e a margem fica abaixo de {target}.
        </p>
      ))}
      {floor.stale ? (
        <p className="text-[var(--muted-foreground)]">
          Calculado com outra meta.{" "}
          {onRecalculate ? (
            <button
              type="button"
              onClick={onRecalculate}
              disabled={recalculateDisabled}
              className={cn(
                "cursor-pointer font-medium text-[var(--primary)] underline-offset-4 hover:underline",
                recalculateDisabled && "opacity-50",
              )}
            >
              Recalcular
            </button>
          ) : null}
        </p>
      ) : null}
      {!floor.refined ? (
        <p className="text-[var(--muted-foreground)]">
          Estimativa: o Mercado Livre não respondeu todas as cotações.
        </p>
      ) : null}
    </div>
  );
}
