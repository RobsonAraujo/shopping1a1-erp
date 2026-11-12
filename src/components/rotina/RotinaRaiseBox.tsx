import { AlertTriangle } from "lucide-react";
import { formatMoney, formatMoneyWhole, formatPercent } from "@/lib/rotina/format";
import type { RotinaRaisePanel } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

const PANEL_CLASS = "rounded-lg border border-[var(--border)]/70 bg-[var(--muted)]/35 px-3 py-2.5 text-xs";
const LABEL_CLASS =
  "block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]";

/**
 * "Até onde dá para subir" do card de subida no catálogo: o teto para seguir
 * ganhando em destaque (como o mínimo no painel do piso), o ganho logo abaixo,
 * e a escada hoje → dividir para situar. Tudo estimativa.
 */
export function RotinaRaiseBox({
  panel,
  className,
}: {
  panel: RotinaRaisePanel;
  className?: string;
}) {
  return (
    <div className={cn(PANEL_CLASS, "space-y-2", className)}>
      <span className={LABEL_CLASS}>Até onde dá para subir · estimativa</span>
      <div className="min-w-0">
        <span className="block text-[var(--muted-foreground)]">Ganhar sozinho até:</span>
        <strong className="block text-lg font-semibold leading-tight tabular-nums text-[var(--foreground)]">
          ~{formatMoney(panel.winCeiling)}
        </strong>
        <span className="block font-medium tabular-nums text-emerald-700">
          +{formatMoney(panel.gainPerUnit)} por venda (+{formatPercent(panel.gainPercent)})
        </span>
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-[var(--border)]/70 pt-2 tabular-nums text-[var(--muted-foreground)]">
        <dt>Hoje</dt>
        <dd className="text-right text-[var(--foreground)]">{formatMoney(panel.currentPrice)}</dd>
        <dt>Dividir o 1º lugar</dt>
        <dd className="text-right text-[var(--foreground)]">~{formatMoney(panel.shareCeiling)}</dd>
      </dl>

      {panel.monthlyGain !== null ? (
        <p className="leading-relaxed text-[var(--muted-foreground)]">
          ≈ <strong className="font-semibold tabular-nums text-[var(--foreground)]">
            +{formatMoneyWhole(panel.monthlyGain)}
          </strong>{" "}
          por mês, antes de taxa e imposto
        </p>
      ) : null}

      {panel.warnings.map((warning) => (
        <p key={warning} className="flex gap-1.5 leading-relaxed text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{warning}</span>
        </p>
      ))}
    </div>
  );
}
