"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronDown, Info } from "lucide-react";
import {
  MaskedMoneyField,
  MaskedPercentField,
} from "@/components/shared/FinancialCostInputFields";
import { PlanningInfoTrigger } from "@/components/shared/PlanningInfoTrigger";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  type MarginBasis,
} from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import {
  buildRowIssues,
  type LucratividadeTaxContext,
} from "@/lib/lucratividade/row-issues";
import { valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";
import { MarginPriceSuggestion } from "@/components/lucratividade/detail-sheet/MarginPriceSuggestion";
import type { LiveListingRowState } from "@/components/lucratividade/hooks/useLiveListingRow";

function SummaryTile({
  label,
  percent,
  value,
  footnote,
  excluded,
}: {
  label: string;
  percent: number | null;
  value: number | null;
  footnote?: string | null;
  excluded: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          excluded ? "text-[var(--muted-foreground)]" : valueToneClass(percent),
        )}
      >
        {formatFinancialPercent(percent)}
      </p>
      <p className="text-xs tabular-nums text-[var(--muted-foreground)]">
        {value !== null ? `${formatFinancialMoney(value)} por unidade` : "—"}
      </p>
      {footnote ? (
        <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}

export function MarginTab({
  row,
  live,
  isSimulation,
  periodLabel,
  targetMarginPercent,
  marginBasis,
  taxContext,
}: {
  row: FinancialEvaluationRow;
  live: LiveListingRowState;
  isSimulation: boolean;
  /** Ex.: "7 dias" / "01/10 – 06/10". */
  periodLabel: string | null;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  taxContext: LucratividadeTaxContext;
}) {
  const issues = buildRowIssues(row, taxContext);
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const excluded = marginExclusionReason(row) !== null;
  const basisNote = isSimulation
    ? "No preço de hoje"
    : `No período${periodLabel ? ` (${periodLabel})` : ""}, preço médio ${formatFinancialMoney(row.salePrice)}`;
  const notes = row.notes ?? [];

  return (
    <div className="space-y-4">
      {blockers.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle className="size-4" aria-hidden />
            {excluded ? "Fora da média até resolver" : "Pendências do cadastro"}
          </p>
          <ul className="mt-2 space-y-2">
            {blockers.map((issue) => (
              <li key={issue.key} className="text-sm">
                <p className="font-medium">{issue.title}</p>
                <p className="text-xs leading-relaxed opacity-90">
                  {issue.detail}
                </p>
                {issue.action ? (
                  <Link
                    href={issue.action.href}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                  >
                    {issue.action.label}
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-3 text-xs text-[var(--muted-foreground)]">
          {warnings.map((issue) => (
            <li key={issue.key} className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {issue.detail}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <p className="mb-2 text-xs text-[var(--muted-foreground)]">{basisNote}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryTile
            label="Margem de contribuição"
            percent={row.breakdown?.marginPercent ?? null}
            value={row.breakdown?.marginValue ?? null}
            excluded={excluded}
          />
          <SummaryTile
            label="Após ADS"
            percent={row.adsMetricsAvailable ? row.marginAfterAdsPercent : null}
            value={row.adsMetricsAvailable ? row.marginAfterAdsValue : null}
            footnote={
              !row.adsMetricsAvailable
                ? "Sem dados de Product Ads."
                : row.tacosPercent != null
                  ? `TACOS ${formatFinancialPercent(row.tacosPercent)}`
                  : null
            }
            excluded={excluded}
          />
        </div>
      </div>

      {row.breakdown ? (
        <section>
          <p className="mb-1 text-sm font-semibold">De onde vem a margem</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <th className="py-2 pr-4 font-medium">Item</th>
                <th className="py-2 pr-4 text-right font-medium">Valor</th>
                <th className="py-2 text-right font-medium">% do preço</th>
              </tr>
            </thead>
            <tbody>
              {row.breakdown.lines.map((line) => {
                const isResult =
                  line.key === "margin" || line.key === "marginAfterAds";
                return (
                  <tr
                    key={line.key}
                    className={cn(
                      "border-b border-[var(--border)]",
                      isResult && "font-semibold",
                      line.key === "ads" && "text-[var(--muted-foreground)]",
                      line.key === "mlFeeRebate" && "text-emerald-800",
                    )}
                  >
                    <td className="py-2 pr-4">{line.label}</td>
                    <td
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        isResult && valueToneClass(line.value),
                      )}
                    >
                      {formatFinancialMoney(line.value)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatFinancialPercent(line.percentOfSale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <MarginPriceSuggestion
        live={live}
        targetMarginPercent={targetMarginPercent}
        marginBasis={marginBasis}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Custos do cadastro</p>
          <Link
            href="/dashboard/produtos"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
          >
            Editar em Meus produtos
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
        {row.isKitComposition && row.kitComponents ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Kit sem SKU próprio — custo e imposto vêm da composição:{" "}
            {row.kitComponents.map((c) => `${c.sku} × ${c.quantity}`).join(", ")}.
          </p>
        ) : row.sku ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            SKU {row.sku}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <MaskedMoneyField
            key={`product-cost-${row.mlItemId}`}
            id="product-cost"
            label="Custo de precificação"
            value={row.productCost}
            readOnly
          />
          <MaskedMoneyField
            key={`extra-costs-${row.mlItemId}`}
            id="extra-costs"
            label="Custos extras"
            value={row.extraCosts}
            readOnly
          />
          <div className="relative">
            {row.isKitComposition ? (
              <PlanningInfoTrigger
                className="absolute -top-1 right-0"
                content="Anúncio kit: esta alíquota é a média ponderada dos impostos dos SKUs componentes cadastrados (ponderada pelo custo de cada um)."
              />
            ) : null}
            <MaskedPercentField
              key={`tax-rate-${row.mlItemId}`}
              id="tax-rate"
              label="Alíquota impostos"
              value={row.taxRatePercent}
              readOnly
            />
          </div>
        </div>
      </section>

      {notes.length > 0 || row.adsMetricsAvailable ? (
        <details className="group rounded-lg border border-[var(--border)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium">
            Como calculamos
            <ChevronDown
              className="size-4 text-[var(--muted-foreground)] transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="space-y-1 border-t border-[var(--border)] px-3 py-2.5 text-xs text-[var(--muted-foreground)]">
            {notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
            {row.adsMetricsAvailable ? (
              <li>
                • Product Ads em {row.adsPeriodDays}{" "}
                {row.adsPeriodDays === 1 ? "dia" : "dias"}
                {row.tacosPercent != null
                  ? ` · TACOS ${formatFinancialPercent(row.tacosPercent)}`
                  : ""}
                {row.acosPercent != null
                  ? ` · ACOS ${formatFinancialPercent(row.acosPercent)}`
                  : ""}
                {row.adsCost != null && row.adsCost > 0
                  ? ` · gasto ${formatFinancialMoney(row.adsCost)}`
                  : ""}
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
