"use client";

import { Loader2 } from "lucide-react";
import { PlanningInfoTrigger } from "@/components/shared/PlanningInfoTrigger";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import {
  buildSalesMixTable,
  type SalesMixTableRow,
} from "@/lib/lucratividade/sales-mix";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import { valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";
import {
  useSalesMix,
  type SalesMixPeriod,
} from "@/components/lucratividade/hooks/useSalesMix";
import type { LiveListingRowState } from "@/components/lucratividade/hooks/useLiveListingRow";

const cellPad = "py-2 pr-3";

function units(n: number) {
  return `${n.toLocaleString("pt-BR")} un.`;
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

/**
 * "Composição das vendas" do painel (só períodos de venda): o que entrou na
 * média do anúncio, por canal × forma de envio. Não recalcula nada — cada
 * modalidade usa o mesmo custo, imposto e frete da linha, e o total é a
 * própria linha.
 */
export function SalesMixSection({
  row,
  period,
  live,
}: {
  row: FinancialEvaluationRow;
  period: SalesMixPeriod;
  live: LiveListingRowState;
}) {
  const state = useSalesMix(row.mlItemId, period);
  const ready = state?.status === "ready" ? state.data : null;
  const entries =
    ready && ready.entries.length > 0 ? ready.entries : (row.salesMix ?? []);
  if (entries.length === 0) return null;

  const table = buildSalesMixTable(row, entries);
  const showMargin = table.marginAvailable;
  const notes: string[] = [];
  if (table.hasFlex) {
    notes.push(
      "Flex: a tarifa do Mercado Livre inclui custo fixo. O frete usado é a estimativa do anúncio — o custo da sua entrega não está no sistema.",
    );
  }
  if (ready && table.unclassifiedUnits > 0) {
    notes.push(
      ready.shipments.capped
        ? `${units(table.unclassifiedUnits)} sem envio classificado: consultamos os ${ready.shipments.classified.toLocaleString("pt-BR")} envios mais recentes do período.`
        : `${units(table.unclassifiedUnits)} sem envio classificado (o Mercado Livre não informou o envio).`,
    );
  }
  if (table.feeFromRow) {
    notes.push("Onde o pedido veio sem tarifa, usamos a tarifa média do anúncio.");
  }
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
    <section aria-label="Composição das vendas">
      <div className="mb-1 flex items-center gap-1.5">
        <p className="text-sm font-semibold">Composição das vendas</p>
        <PlanningInfoTrigger
          className="h-5 w-5"
          content="As vendas do período separadas por canal (varejo ou B2B, compra de empresa) e forma de envio. Cada linha usa o mesmo custo, imposto e frete estimado da margem do anúncio — só o preço e a tarifa mudam — e o total fecha na margem acima."
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className={cn(cellPad, "font-medium")}>Modalidade</th>
              <th className={cn(cellPad, "text-right font-medium")}>Vendas</th>
              <th className={cn(cellPad, "text-right font-medium")}>Preço médio</th>
              <th className={cn(cellPad, "text-right font-medium")}>Tarifa ML/un.</th>
              {showMargin ? (
                <th className="py-2 text-right font-medium">Margem</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((mixRow) => (
              <tr key={mixRow.key} className="border-b border-[var(--border)]">
                <td className={cellPad}>{mixRow.label}</td>
                <td className={cn(cellPad, "text-right tabular-nums")}>
                  {units(mixRow.units)}
                </td>
                <td className={cn(cellPad, "text-right tabular-nums")}>
                  <PriceCell row={mixRow} />
                </td>
                <td className={cn(cellPad, "text-right tabular-nums")}>
                  {formatFinancialMoney(mixRow.feePerUnit)}
                </td>
                {showMargin ? (
                  <td className="py-2 text-right tabular-nums">
                    <div className={valueToneClass(mixRow.marginPercent)}>
                      {formatFinancialPercent(mixRow.marginPercent)}
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {mixRow.marginValue !== null
                        ? `${formatFinancialMoney(mixRow.marginValue)}/un.`
                        : "—"}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className={cellPad}>Total do anúncio</td>
              <td className={cn(cellPad, "text-right tabular-nums")}>
                {units(table.total.units)}
              </td>
              <td className={cn(cellPad, "text-right tabular-nums")}>
                {formatFinancialMoney(table.total.averagePrice)}
              </td>
              <td className={cn(cellPad, "text-right tabular-nums")}>
                {formatFinancialMoney(table.total.feePerUnit)}
              </td>
              {showMargin ? (
                <td className="py-2 text-right tabular-nums">
                  <div className={valueToneClass(table.total.marginPercent)}>
                    {formatFinancialPercent(table.total.marginPercent)}
                  </div>
                  <div className="text-[11px] font-normal text-[var(--muted-foreground)]">
                    {table.total.marginValue !== null
                      ? `${formatFinancialMoney(table.total.marginValue)}/un.`
                      : "—"}
                  </div>
                </td>
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
    </section>
  );
}
