import { Fragment } from "react";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import {
  DRE_STATIC_ROWS,
  dreMonthShortLabel,
  isColoredRow,
  rowBackgroundClass,
  rowLabelClass,
  type DreStaticRowId,
  type DreTableRow,
} from "@/lib/dre/dre-table-rows";
import { cn } from "@/lib/utils";

const MONTHS = [7, 8] as const;

const AMOUNTS: Record<DreStaticRowId, [number, number]> = {
  totalEntrada: [198400, 214800],
  revenueMl: [198400, 214800],
  totalCustoOperacional: [-152200, -164700],
  cancelledSalesMl: [0, 0],
  saleFeeMl: [-25200, -28120],
  partialReturnsMl: [0, 0],
  returnFeeMl: [0, 0],
  specialFeesMl: [0, 0],
  productCostErp: [-89200, -98400],
  taxErp: [0, 0],
  sellerShippingMl: [0, 0],
  fullShippingMl: [0, 0],
  fullStorageMl: [0, 0],
  fullNonComplianceMl: [0, 0],
  adsCost: [-8800, -10000],
  minhaPaginaMl: [0, 0],
  affiliateFeeMl: [0, 0],
  margemContribuicao: [46200, 50100],
  totalCustoFixo: [-9800, -9800],
  lucroOperacionalAntesInvestimentos: [36400, 40300],
  totalInvestimento: [-4200, -1880],
  lucroOperacional: [32200, 38420],
};

const PERCENTS: Partial<Record<DreStaticRowId, [number, number]>> = {
  margemContribuicao: [23.29, 23.32],
  lucroOperacionalAntesInvestimentos: [18.35, 18.76],
  lucroOperacional: [16.23, 17.89],
};

type DisplayRow =
  | { key: string; source: DreTableRow; amounts: [number, number] }
  | {
      key: string;
      source: "manual";
      label: string;
      amounts: [number, number];
      zebra: boolean;
    };

function staticRow(id: DreStaticRowId): DisplayRow {
  const source = DRE_STATIC_ROWS.find((row) => row.id === id)!;
  return { key: id, source, amounts: AMOUNTS[id] };
}

const DISPLAY: DisplayRow[] = [
  staticRow("totalEntrada"),
  staticRow("totalCustoOperacional"),
  staticRow("saleFeeMl"),
  staticRow("productCostErp"),
  staticRow("adsCost"),
  staticRow("margemContribuicao"),
  staticRow("totalCustoFixo"),
  {
    key: "aluguel",
    source: "manual",
    label: "Aluguel Salão",
    amounts: [-9800, -9800],
    zebra: false,
  },
  staticRow("lucroOperacionalAntesInvestimentos"),
  staticRow("totalInvestimento"),
  {
    key: "software",
    source: "manual",
    label: "Software",
    amounts: [-4200, -1880],
    zebra: false,
  },
  staticRow("lucroOperacional"),
];

const ALT_ROW_BG = "#f4f2f7";

export function DemoDre() {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
      <div className="border-b border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2">
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Totais + alguns detalhes (tarifa, CMV, ADS, aluguel, software) ·
          demonstração
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] table-fixed border-collapse text-[12.5px]">
          <colgroup>
            <col style={{ width: "40%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="border-b border-[var(--border)] bg-white px-3 py-2 text-left text-[12.5px] font-bold uppercase text-[var(--muted-foreground)]">
                Linha
              </th>
              {MONTHS.map((month) => (
                <th
                  key={month}
                  className="border-b border-[var(--border)] bg-white px-1 py-2 text-center font-normal"
                >
                  <span
                    className={cn(
                      "text-[12.5px] font-bold tracking-wider text-[var(--muted-foreground)]",
                      month === 8 && "text-[var(--primary)]",
                    )}
                  >
                    {dreMonthShortLabel(month)}
                  </span>
                </th>
              ))}
              <th className="border-b border-[var(--border)] bg-[var(--muted)]/30 px-2 py-2 text-center text-[12.5px] font-bold uppercase text-[var(--muted-foreground)]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {DISPLAY.map((row) => {
              if (row.source === "manual") {
                const jul = row.amounts[0];
                const ago = row.amounts[1];
                const total = jul + ago;
                const cellStyle = row.zebra
                  ? { backgroundColor: ALT_ROW_BG }
                  : { backgroundColor: "#fff" };
                return (
                  <tr key={row.key} style={cellStyle}>
                    <td
                      className="px-3 py-2 pl-6 text-[12.5px] font-bold leading-tight"
                      style={cellStyle}
                    >
                      {row.label}
                    </td>
                    {[jul, ago, total].map((amount, i) => (
                      <td
                        key={i}
                        className="px-1.5 py-2 text-center align-middle text-[12.5px] font-bold tabular-nums leading-tight text-[var(--foreground)]"
                        style={cellStyle}
                      >
                        {formatFinancialMoney(amount)}
                      </td>
                    ))}
                  </tr>
                );
              }

              const dreRow = row.source;
              if (dreRow.type !== "static") return null;
              const bg = rowBackgroundClass(dreRow);
              const colored = isColoredRow(dreRow);
              const detailPos = (
                ["saleFeeMl", "productCostErp", "adsCost"] as DreStaticRowId[]
              ).indexOf(dreRow.id);
              const isAltDetail = detailPos >= 0 && detailPos % 2 === 1;
              const jul = row.amounts[0];
              const ago = row.amounts[1];
              const total = jul + ago;
              const pct = PERCENTS[dreRow.id];
              const cellStyle = isAltDetail
                ? { backgroundColor: ALT_ROW_BG }
                : undefined;
              const indent = dreRow.indent;

              return (
                <Fragment key={row.key}>
                  <tr className={isAltDetail ? undefined : bg} style={cellStyle}>
                    <td
                      className={cn(
                        "px-3 py-2",
                        indent && "pl-6",
                        !isAltDetail && bg,
                        rowLabelClass(dreRow),
                      )}
                      style={cellStyle}
                    >
                      {dreRow.label}
                    </td>
                    {[jul, ago, total].map((amount, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-1.5 py-2 text-center align-middle text-[12.5px] font-bold tabular-nums leading-tight",
                          !isAltDetail && bg,
                          indent && "text-[var(--foreground)]",
                        )}
                        style={cellStyle}
                      >
                        {formatFinancialMoney(amount)}
                      </td>
                    ))}
                  </tr>
                  {dreRow.showPercent && pct ? (
                    <tr className={bg}>
                      <td className={cn("px-3 py-1.5", bg)} />
                      {[
                        pct[0],
                        pct[1],
                        (pct[0] * Math.abs(jul) + pct[1] * Math.abs(ago)) /
                          (Math.abs(jul) + Math.abs(ago)),
                      ].map((percent, i) => (
                        <td
                          key={i}
                          className={cn(
                            "px-1.5 py-1.5 text-center align-middle text-[12.5px] font-bold tabular-nums leading-tight",
                            bg,
                            colored ? "text-white" : undefined,
                          )}
                        >
                          {formatFinancialPercent(percent)}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
