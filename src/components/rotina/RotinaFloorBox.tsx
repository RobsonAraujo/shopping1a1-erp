"use client";

import { AlertTriangle, Info } from "lucide-react";
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

const PANEL_CLASS = "rounded-lg border border-[var(--border)]/70 bg-[var(--muted)]/35 px-3 py-2.5 text-xs";
const LABEL_CLASS =
  "block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]";

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
  className,
}: {
  floor: RotinaFloorView;
  showDiscount: boolean;
  onRecalculate?: () => void;
  recalculateDisabled?: boolean;
  className?: string;
}) {
  if (floor.effectivePrice === null) {
    return (
      <div className={cn(PANEL_CLASS, className)}>
        <span className={LABEL_CLASS}>Até onde dá para ir</span>
        <p className="mt-1 leading-relaxed text-[var(--muted-foreground)]">
          {REASON_TEXT[floor.reason] || REASON_TEXT.not_computed}
        </p>
      </div>
    );
  }

  const target = formatPercent(floor.targetPercent);
  const discountBase =
    showDiscount && floor.maxDiscountPercent !== null ? floor.discountBase : null;
  const discount = discountBase !== null;

  return (
    <div className={cn(PANEL_CLASS, "space-y-2", className)}>
      <span className={LABEL_CLASS}>Até onde dá para ir</span>
      <div className={cn("grid gap-3", discount && "grid-cols-2")}>
        <div className="min-w-0">
          <span className="block text-[var(--muted-foreground)]">Mínimo p/ {target}:</span>
          <strong className="block text-lg font-semibold leading-tight tabular-nums text-[var(--foreground)]">
            {formatMoney(floor.effectivePrice)}
          </strong>
          {floor.boundBy === "pma" ? (
            <span className="block text-[11px] text-[var(--muted-foreground)]">é o seu PMA</span>
          ) : null}
        </div>
        {discountBase !== null ? (
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)]">
              desconto máx.
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="cursor-pointer rounded text-[var(--muted-foreground)]/70 hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
            <strong className="block text-lg font-semibold leading-tight tabular-nums text-[var(--foreground)]">
              {floor.maxDiscountPercent}%
            </strong>
            <span className="block text-[11px] tabular-nums text-[var(--muted-foreground)]">
              sobre {formatMoney(discountBase)}
            </span>
          </div>
        ) : null}
      </div>

      <p className="border-t border-[var(--border)]/70 pt-2 tabular-nums text-[var(--muted-foreground)]">
        Após ADS {moneyOrDash(floor.afterAdsPrice)} · MC {moneyOrDash(floor.mcPrice)}
        {floor.afterAdsMissing === "ads_unavailable"
          ? " · ADS indisponível: vale o da MC"
          : floor.afterAdsMissing === "spend_without_sales"
            ? " · ADS gastando sem vender: vale o da MC"
            : null}
      </p>
      {floor.bands.map((band) => (
        <p key={`${band.from}-${band.to}`} className="flex gap-1.5 leading-relaxed text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Evite {formatMoney(band.from)} a {formatMoney(band.to)}: nessa faixa o
            frete passa a ser seu e a margem fica abaixo de {target}.
          </span>
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
                "cursor-pointer rounded font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
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
