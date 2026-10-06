import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BlurredValue } from "@/components/shared/BlurredValue";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  marginBasisLabel,
  type MarginBasis,
} from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import {
  MARGIN_EXCLUSION_LABEL,
  marginExclusionReason,
  type MarginExclusionReason,
} from "@/lib/lucratividade/margin-summary";
import type { TargetPriceCell } from "@/lib/lucratividade/target-margin";
import { valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

export const tableCellPad = "px-3 py-3";
export const tableHeadPad = "px-3 py-2";

const EXCLUSION_TOOLTIP: Record<MarginExclusionReason, string> = {
  missing_cost:
    "Sem custo cadastrado: a margem sairia com custo R$ 0. Não entra na média até cadastrar o custo em Meus produtos.",
  missing_tax:
    "Sem alíquota: a margem sairia sem imposto. Não entra na média até ter alíquota.",
  kit_incomplete:
    "Kit com componente sem cadastro: o custo está parcial. Não entra na média até completar o kit.",
  incomplete:
    "Taxa ou frete não puderam ser consultados no ML. Não entra na média — tente Recalcular.",
};

/** Flag do anúncio que não entra na média, com o motivo e como resolver. */
export function ExclusionBadge({ row }: { row: FinancialEvaluationRow }) {
  const reason = marginExclusionReason(row);
  if (!reason) return null;
  return (
    <Badge
      variant="warning"
      dot
      className="h-5 px-1.5 text-[10px] font-medium"
      title={EXCLUSION_TOOLTIP[reason]}
    >
      {MARGIN_EXCLUSION_LABEL[reason]}
    </Badge>
  );
}

export function PmaBadge({
  row,
  isSimulation,
}: {
  row: FinancialEvaluationRow;
  isSimulation: boolean;
}) {
  if (row.pending || row.pmaPrice === null || row.salePrice >= row.pmaPrice) {
    return null;
  }
  const priceLabel = isSimulation ? "Preço de hoje" : "Preço médio vendido";
  return (
    <Badge
      variant="destructive"
      className="h-5 px-1.5 text-[10px]"
      title={`${priceLabel} (${formatFinancialMoney(row.salePrice)}) abaixo do PMA (${formatFinancialMoney(row.pmaPrice)}).`}
    >
      Abaixo do PMA
    </Badge>
  );
}

export function StackedMarginCell({
  percent,
  value,
  sublabel,
  unavailable,
  pending,
  excluded,
  excludedNote,
}: {
  percent: number | null;
  value: number | null;
  sublabel?: string | null;
  unavailable?: boolean;
  /** Linha ainda esperando preço/taxa/frete via streaming. */
  pending?: boolean;
  /** Fora da média — valor esmaecido (margem não confiável). */
  excluded?: boolean;
  /** Aviso em destaque sob o valor esmaecido (ex.: "fora da média"). */
  excludedNote?: string;
}) {
  if (pending) {
    return (
      <div className="text-right">
        <div className="font-semibold">
          <BlurredValue srLabel="Margem ainda carregando" />
        </div>
        <div className="mt-0.5 text-xs">
          <BlurredValue srLabel="Valor da margem ainda carregando" />
        </div>
      </div>
    );
  }

  if (unavailable) {
    return <span className="text-[var(--muted-foreground)]">—</span>;
  }

  return (
    <div className="text-right">
      <div className={cn(excluded && "opacity-45")}>
        <div
          className={cn(
            "font-semibold tabular-nums",
            excluded ? "text-[var(--muted-foreground)]" : valueToneClass(percent),
          )}
        >
          {formatFinancialPercent(percent)}
        </div>
        <div className="mt-0.5 text-xs tabular-nums text-[var(--muted-foreground)]">
          {formatFinancialMoney(value)}
          {value !== null ? "/un." : ""}
        </div>
        {sublabel ? (
          <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
            {sublabel}
          </div>
        ) : null}
      </div>
      {excluded && excludedNote ? (
        <div className="mt-0.5 text-[10px] font-medium text-amber-700">
          {excludedNote}
        </div>
      ) : null}
    </div>
  );
}

/** Célula "Preço p/ meta": ✓ na meta, preço mínimo (+ quanto falta) ou o motivo. */
export function TargetPriceCellView({
  cell,
  targetMarginPercent,
  marginBasis,
}: {
  cell: TargetPriceCell;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
}) {
  const targetLabel = `${formatFinancialPercent(targetMarginPercent)} de ${marginBasisLabel(marginBasis)}`;
  switch (cell.kind) {
    case "pending":
      return <BlurredValue srLabel="Preço p/ meta carregando" />;
    case "refining":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Consultando ML
        </span>
      );
    case "excluded":
      return (
        <span
          className="text-xs text-[var(--muted-foreground)]"
          title="Complete o cadastro para calcular o preço p/ meta."
        >
          —
        </span>
      );
    case "meets":
      return (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
          title={`Margem já atinge a meta de ${targetLabel}.`}
        >
          <Check className="size-3.5" aria-hidden />
          Na meta
        </span>
      );
    case "impossible":
      return (
        <span
          className="text-xs font-medium text-rose-700"
          title={`Com os custos atuais, nenhum preço atinge ${targetLabel}.`}
        >
          Inatingível
        </span>
      );
    case "unavailable":
      return (
        <span className="text-xs text-[var(--muted-foreground)]" title={cell.reason}>
          —
        </span>
      );
    case "price": {
      const todayOk = cell.delta !== null && cell.delta <= 0.005;
      const title = [
        `Menor preço que entrega ${targetLabel}.`,
        cell.livePrice !== null
          ? `Hoje o anúncio está a ${formatFinancialMoney(cell.livePrice)}.`
          : null,
        cell.estimate
          ? "Estimativa: taxa ML proporcional ao preço."
          : "Taxa e frete consultados no ML nesse preço.",
      ]
        .filter(Boolean)
        .join(" ");
      return (
        <div className="text-right" title={title}>
          <div
            className={cn(
              "font-medium tabular-nums",
              todayOk ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {cell.estimate ? "~" : ""}
            {formatFinancialMoney(cell.minSalePrice)}
          </div>
          {cell.delta !== null ? (
            <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
              {todayOk
                ? "preço de hoje já atinge"
                : `+${formatFinancialMoney(cell.delta)} sobre hoje`}
            </div>
          ) : null}
        </div>
      );
    }
  }
}
