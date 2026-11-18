"use client";

import { ChevronDown, Layers, Loader2 } from "lucide-react";
import { PlanningInfoTrigger } from "@/components/shared/PlanningInfoTrigger";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { OrderChannel } from "@/lib/mercadolibre/order-channel";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import type { LucratividadeTaxContext } from "@/lib/lucratividade/row-issues";
import {
  buildSalesMixTable,
  describeMarginPrecision,
  describeSalesMixRow,
  salesMixLogisticFromShipmentType,
  type MarginPrecisionStatus,
  type SalesMixRowExplanation,
  type SalesMixTableRow,
} from "@/lib/lucratividade/sales-mix";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import { valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";
import {
  ChannelShareBar,
  ChannelSwatch,
  type ChannelSharePart,
} from "@/components/lucratividade/channel-share";
import {
  useSalesMix,
  type SalesMixPeriod,
  type SalesMixState,
} from "@/components/lucratividade/hooks/useSalesMix";
import type { LiveListingRowState } from "@/components/lucratividade/hooks/useLiveListingRow";

const cellPad = "py-2 pr-3";
/** Número numa célula: não quebra (ex.: "-R$ 0,27/un." quebrava no hífen). */
const numCell = "text-right tabular-nums whitespace-nowrap";
/** Preço e tarifa viram colunas só do `sm` pra cima; no celular, sublinha. */
const wideOnly = "hidden sm:table-cell";
const smallBadge = "px-1.5 py-0 text-[10px] font-medium";

/** Selos calmos — nada de âmbar (avisos de cálculo não devem alarmar). */
const PRECISION_BADGE: Record<MarginPrecisionStatus, BadgeProps["variant"]> = {
  real: "success",
  estimated: "muted",
  not_applied: "outline",
  outside: "outline",
};

function units(n: number) {
  return `${n.toLocaleString("pt-BR")} un.`;
}

function ComingSoon({ text }: { text: string }) {
  return (
    <span className="mt-1 flex items-start gap-1.5">
      <Badge variant="outline" className={cn(smallBadge, "shrink-0")}>
        Em breve
      </Badge>
      <span>{text.charAt(0).toUpperCase() + text.slice(1)}</span>
    </span>
  );
}

function RowExplainer({ explanation }: { explanation: SalesMixRowExplanation }) {
  return (
    <div className="space-y-1.5">
      {explanation.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {explanation.comingSoon ? <ComingSoon text={explanation.comingSoon} /> : null}
    </div>
  );
}

function PriceCell({ row }: { row: Pick<SalesMixTableRow, "averagePrice" | "minUnitPrice" | "maxUnitPrice"> }) {
  const ranged =
    row.minUnitPrice !== null &&
    row.maxUnitPrice !== null &&
    row.maxUnitPrice - row.minUnitPrice >= 0.01;
  return (
    <>
      <div>{formatFinancialMoney(row.averagePrice)}</div>
      {ranged ? (
        <div className="text-[11px] text-[var(--muted-foreground)]">
          {formatFinancialMoney(row.minUnitPrice)} a {formatFinancialMoney(row.maxUnitPrice)}
        </div>
      ) : null}
    </>
  );
}

/** No celular, preço e tarifa embaixo do nome (as colunas somem). */
function CompactPriceFee({ price, fee }: { price: number; fee: number | null }) {
  return (
    <p className="text-[11px] leading-snug text-[var(--muted-foreground)] tabular-nums sm:hidden">
      {formatFinancialMoney(price)} · tarifa {formatFinancialMoney(fee)}/un.
    </p>
  );
}

function MarginCell({ percent, value }: { percent: number | null; value: number | null }) {
  return (
    <td className={cn("py-2", numCell)}>
      <div className={valueToneClass(percent)}>{formatFinancialPercent(percent)}</div>
      <div className="text-[11px] font-normal text-[var(--muted-foreground)]">
        {value !== null ? `${formatFinancialMoney(value)}/un.` : "—"}
      </div>
    </td>
  );
}

/**
 * "Composição das vendas" do painel (só períodos de venda), num painel
 * embutido como o "Por canal de venda" do topo. Mostra o que entrou na média
 * do anúncio e diz, por modalidade e para a conta inteira, o que é real e o
 * que é estimado. Não recalcula nada: cada modalidade usa o mesmo custo,
 * imposto e frete da linha, e o total é a própria linha.
 */
export function SalesMixPanel({
  row,
  state,
  live,
  taxContext,
}: {
  row: FinancialEvaluationRow;
  /** Busca dos envios; `null` = sem busca (só canal × tipo da linha). */
  state: SalesMixState | null;
  live: LiveListingRowState;
  taxContext: LucratividadeTaxContext;
}) {
  const ready = state?.status === "ready" ? state.data : null;
  const entries =
    ready && ready.entries.length > 0 ? ready.entries : (row.salesMix ?? []);
  if (entries.length === 0) return null;

  const table = buildSalesMixTable(row, entries);
  const showMargin = table.marginAvailable;
  const listingLogistic = row.shippingLogisticType
    ? salesMixLogisticFromShipmentType(row.shippingLogisticType)
    : null;
  const explainContext = {
    shippingCost: row.shippingCost,
    listingLogistic,
    shipmentsCapped: ready?.shipments.capped ?? false,
  };
  const precision = describeMarginPrecision(row, {
    taxRegime: taxContext.taxRegime,
    listingLogistic,
    feeFromRow: table.feeFromRow,
  });

  const revenueByChannel = new Map<OrderChannel, number>();
  for (const mixRow of table.rows) {
    revenueByChannel.set(
      mixRow.channel,
      (revenueByChannel.get(mixRow.channel) ?? 0) + mixRow.revenue,
    );
  }
  const mixRevenue = [...revenueByChannel.values()].reduce((sum, v) => sum + v, 0);
  const channelParts: ChannelSharePart[] = (["retail", "b2b"] as const)
    .filter((channel) => (revenueByChannel.get(channel) ?? 0) > 0)
    .map((channel) => ({
      channel,
      revenue: revenueByChannel.get(channel)!,
      revenueShare:
        mixRevenue > 0 ? (revenueByChannel.get(channel)! / mixRevenue) * 100 : null,
    }));

  const notes: string[] = [];
  if (!showMargin) {
    notes.push("A margem por modalidade aparece quando o cadastro do anúncio estiver completo.");
  }
  if (ready && table.unitsDiff !== 0) {
    const diff = Math.abs(table.unitsDiff);
    notes.push(
      `${units(diff)} ${table.unitsDiff > 0 ? "a mais" : "a menos"} que a linha: os pedidos mudaram desde que a página carregou.`,
    );
  }
  const liveMargin =
    live.status === "ready" && live.row.breakdown
      ? { price: live.row.salePrice, percent: live.row.breakdown.marginPercent }
      : null;

  return (
    <section
      aria-label="Composição das vendas"
      className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3 sm:p-4"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        <Layers className="size-3.5" aria-hidden />
        Composição das vendas
        <PlanningInfoTrigger
          className="h-5 w-5"
          label="Como funciona a composição das vendas"
          content="As vendas do período separadas por canal (varejo ou B2B) e forma de envio. Preço e tarifa são os de cada venda; frete, custo e imposto são os mesmos da margem do anúncio — por isso o total fecha na margem acima. O (?) de cada linha mostra o que entrou na conta."
        />
      </p>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        As mesmas vendas da margem acima, separadas por canal e forma de envio.
      </p>

      {channelParts.length > 1 ? (
        <ChannelShareBar
          parts={channelParts}
          label="Faturamento do anúncio por canal"
          className="mt-3"
        />
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className={cn(cellPad, "font-medium")}>Modalidade</th>
              <th className={cn(cellPad, "text-right font-medium")}>Vendas</th>
              <th className={cn(cellPad, wideOnly, "text-right font-medium")}>Preço médio</th>
              <th className={cn(cellPad, wideOnly, "text-right font-medium")}>Tarifa ML/un.</th>
              {showMargin ? (
                <th className="py-2 text-right font-medium">Margem</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((mixRow) => {
              const explanation = describeSalesMixRow(mixRow, explainContext);
              return (
                <tr key={mixRow.key} className="border-b border-[var(--border)] align-top">
                  <td className={cellPad}>
                    <div className="flex items-start gap-2">
                      <ChannelSwatch channel={mixRow.channel} className="mt-1.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-0.5">
                          <span data-mix-label>{mixRow.label}</span>
                          <PlanningInfoTrigger
                            className="h-5 w-5"
                            label={`Como calculamos ${mixRow.label}`}
                            content={<RowExplainer explanation={explanation} />}
                          />
                        </div>
                        <CompactPriceFee price={mixRow.averagePrice} fee={mixRow.feePerUnit} />
                        {explanation.shippingNote ? (
                          <p
                            data-shipping-note
                            className="text-[11px] leading-snug text-[var(--muted-foreground)]"
                          >
                            {explanation.shippingNote}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className={cn(cellPad, numCell)}>{units(mixRow.units)}</td>
                  <td className={cn(cellPad, wideOnly, numCell)}>
                    <PriceCell row={mixRow} />
                  </td>
                  <td className={cn(cellPad, wideOnly, numCell)}>
                    {formatFinancialMoney(mixRow.feePerUnit)}
                  </td>
                  {showMargin ? (
                    <MarginCell percent={mixRow.marginPercent} value={mixRow.marginValue} />
                  ) : null}
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className={cellPad}>
                Total do anúncio
                <CompactPriceFee
                  price={table.total.averagePrice}
                  fee={table.total.feePerUnit}
                />
              </td>
              <td className={cn(cellPad, numCell)}>{units(table.total.units)}</td>
              <td className={cn(cellPad, wideOnly, numCell)}>
                {formatFinancialMoney(table.total.averagePrice)}
              </td>
              <td className={cn(cellPad, wideOnly, numCell)}>
                {formatFinancialMoney(table.total.feePerUnit)}
              </td>
              {showMargin ? (
                <MarginCell
                  percent={table.total.marginPercent}
                  value={table.total.marginValue}
                />
              ) : null}
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
        {state?.status === "loading" ? (
          <li className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Classificando a forma de envio de cada venda no Mercado Livre…
          </li>
        ) : null}
        {state?.status === "error" ? (
          <li>Forma de envio indisponível agora: {state.message}</li>
        ) : null}
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
        {liveMargin ? (
          <li>
            No preço de hoje ({formatFinancialMoney(liveMargin.price)}), a margem é{" "}
            <span className={cn("font-medium", valueToneClass(liveMargin.percent))}>
              {formatFinancialPercent(liveMargin.percent)}
            </span>
            .
          </li>
        ) : null}
      </ul>

      {/* Fechado por padrão — abre quem quiser o detalhe do que é estimado. */}
      <details className="group mt-4 border-t border-[var(--border)] pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)] hover:text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
          O que é real e o que é estimado
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <ul aria-label="O que é real e o que é estimado" className="mt-2 space-y-2.5 text-xs">
          {precision.map((item) => (
            <li
              key={item.key}
              data-precision-key={item.key}
              className="grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-0.5 sm:grid-cols-[7.5rem_7.5rem_minmax(0,1fr)]"
            >
              <span className="font-medium text-[var(--foreground)]">{item.label}</span>
              <span className="justify-self-end sm:justify-self-start">
                <Badge variant={PRECISION_BADGE[item.status]} className={smallBadge}>
                  {item.statusLabel}
                </Badge>
              </span>
              <span className="col-span-2 text-[var(--muted-foreground)] sm:col-span-1">
                {item.detail}
                {item.comingSoon ? <ComingSoon text={item.comingSoon} /> : null}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Busca os envios do anúncio (sob demanda) e mostra o painel. */
export function SalesMixSection({
  row,
  period,
  live,
  taxContext,
}: {
  row: FinancialEvaluationRow;
  period: SalesMixPeriod;
  live: LiveListingRowState;
  taxContext: LucratividadeTaxContext;
}) {
  const state = useSalesMix(row.mlItemId, period);
  return <SalesMixPanel row={row} state={state} live={live} taxContext={taxContext} />;
}
