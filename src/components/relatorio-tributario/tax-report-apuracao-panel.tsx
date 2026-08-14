"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TaxReportHeaderWithTip } from "@/components/relatorio-tributario/tax-report-transaction-table";
import { SortableTh } from "@/components/ui/sortable-th";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import type { ApuracaoConsolidada } from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

type ApuracaoRow = {
  imposto: string;
  debito: number;
  credito: number;
  liquido: number;
  aRecolher: number;
  tip?: string;
};

type ApuracaoSortKey = "debito" | "credito" | "liquido" | "aRecolher";

type DifalUfRow = {
  uf: string;
  valor: number;
};

const APURACAO_COL_CLASS = "px-3 py-2.5 sm:px-4";
const APURACAO_MONEY_COL_CLASS = `${APURACAO_COL_CLASS} text-right whitespace-nowrap tabular-nums`;

function ApuracaoTableRow({
  row,
  highlight,
}: {
  row: ApuracaoRow;
  highlight?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--border)]",
        highlight && "bg-[var(--primary)]/5 font-medium",
      )}
    >
      <td className={cn(APURACAO_COL_CLASS, "min-w-[7rem]")}>
        {row.tip ? (
          <TaxReportHeaderWithTip label={row.imposto} tip={row.tip} align="left" />
        ) : (
          row.imposto
        )}
      </td>
      <td className={APURACAO_MONEY_COL_CLASS}>
        {formatFinancialMoney(row.debito)}
      </td>
      <td className={APURACAO_MONEY_COL_CLASS}>
        {row.credito > 0 ? formatFinancialMoney(row.credito) : "—"}
      </td>
      <td className={APURACAO_MONEY_COL_CLASS}>
        {formatFinancialMoney(row.liquido)}
      </td>
      <td className={cn(APURACAO_MONEY_COL_CLASS, "min-w-[8.5rem]")}>
        {formatFinancialMoney(row.aRecolher)}
      </td>
    </tr>
  );
}

function ApuracaoCard({
  row,
  highlight,
}: {
  row: ApuracaoRow;
  highlight?: boolean;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border border-[var(--border)] p-3",
        highlight && "border-[var(--primary)]/30 bg-[var(--primary)]/5",
      )}
    >
      <p className={cn("text-sm", highlight ? "font-semibold" : "font-medium")}>
        {row.tip ? (
          <TaxReportHeaderWithTip label={row.imposto} tip={row.tip} align="left" />
        ) : (
          row.imposto
        )}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Débitos
          </p>
          <p className="tabular-nums">{formatFinancialMoney(row.debito)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Créditos
          </p>
          <p className="tabular-nums">
            {row.credito > 0 ? formatFinancialMoney(row.credito) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Líquido
          </p>
          <p className="tabular-nums">{formatFinancialMoney(row.liquido)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            A recolher (est.)
          </p>
          <p className="font-medium tabular-nums">
            {formatFinancialMoney(row.aRecolher)}
          </p>
        </div>
      </div>
    </li>
  );
}

export function TaxReportApuracaoPanel({
  apuracao,
  faturamento,
}: {
  apuracao: ApuracaoConsolidada;
  faturamento: number;
}) {
  const [difalOpen, setDifalOpen] = useState(false);
  const isMobile = useIsMobile();

  const rows: ApuracaoRow[] = [
    {
      imposto: "ICMS (SP)",
      debito: apuracao.icms.icmsSemDifalDebito,
      credito: apuracao.icms.credito,
      liquido: Math.max(0, apuracao.icms.icmsSemDifalDebito - apuracao.icms.credito),
      aRecolher: apuracao.icmsARecolherSpEstimado,
      tip: "ICMS interno ou interestadual (UF origem), menos crédito estimado de compra (inclui ICMS-ST recuperável em vendas interestaduais). Corresponde ao DARE-SP.",
    },
    {
      imposto: "DIFAL",
      debito: apuracao.icms.difalDebito,
      credito: 0,
      liquido: apuracao.icms.difalDebito,
      aRecolher: apuracao.difalARecolherEstimado,
      tip: "Diferencial de alíquota — costuma ser pago via GNRE para a UF do comprador.",
    },
    {
      imposto: "PIS",
      debito: apuracao.pis.debito,
      credito: apuracao.pis.credito,
      liquido: apuracao.pis.liquido,
      aRecolher: apuracao.pis.liquido,
      tip: "PIS não-cumulativo: débito sobre vendas menos crédito sobre NF de entrada.",
    },
    {
      imposto: "COFINS",
      debito: apuracao.cofins.debito,
      credito: apuracao.cofins.credito,
      liquido: apuracao.cofins.liquido,
      aRecolher: apuracao.cofins.liquido,
      tip: "COFINS não-cumulativa: débito sobre vendas menos crédito sobre NF de entrada.",
    },
  ];

  const totalARecolher = apuracao.pisCofinsLiquido +
    apuracao.icmsARecolherSpEstimado +
    apuracao.difalARecolherEstimado;

  const { sort, sortedRows, onSortChange } = useTableSort<ApuracaoRow, ApuracaoSortKey>(
    rows,
    (row, key) => row[key],
    { key: "aRecolher", direction: "desc" },
  );

  const difalUfRows: DifalUfRow[] = Object.entries(apuracao.difalPorUf).map(
    ([uf, valor]) => ({ uf, valor }),
  );
  const {
    sort: difalSort,
    sortedRows: sortedDifalUfs,
    onSortChange: onDifalSortChange,
  } = useTableSort<DifalUfRow, "valor">(
    difalUfRows,
    (row, key) => row[key],
    { key: "valor", direction: "desc" },
  );
  const diag = apuracao.diagnostico;
  const pctSemCusto =
    faturamento > 0
      ? (diag.receitaSemCustoCadastrado / faturamento) * 100
      : 0;

  return (
    <div className="space-y-3">
      <Card className="p-0">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">
            <TaxReportHeaderWithTip
              label="Apuração estimada"
              tip="Débito, crédito e líquido por imposto — estrutura similar ao demonstrativo da contabilidade. Valores estimados a partir das vendas ML e cadastro de produtos."
              align="left"
            />
          </h2>
        </div>
        {isMobile ? (
          <ul className="space-y-2 p-3">
            {sortedRows.map((row) => (
              <ApuracaoCard key={row.imposto} row={row} />
            ))}
            <ApuracaoCard
              row={{
                imposto: "Total estimado",
                debito: 0,
                credito: 0,
                liquido: apuracao.pisCofinsLiquido + apuracao.icms.liquido,
                aRecolher: totalARecolher,
              }}
              highlight
            />
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-left text-xs text-[var(--muted-foreground)]">
                  <th className={cn(APURACAO_COL_CLASS, "min-w-[7rem]")}>Imposto</th>
                  <SortableTh
                    label="Débitos"
                    sortKey="debito"
                    sort={sort}
                    onSortChange={onSortChange}
                    className={APURACAO_MONEY_COL_CLASS}
                  />
                  <SortableTh
                    label="Créditos"
                    sortKey="credito"
                    sort={sort}
                    onSortChange={onSortChange}
                    className={APURACAO_MONEY_COL_CLASS}
                  />
                  <SortableTh
                    label="Líquido"
                    sortKey="liquido"
                    sort={sort}
                    onSortChange={onSortChange}
                    className={APURACAO_MONEY_COL_CLASS}
                  />
                  <SortableTh
                    label={
                      <span className="inline-block text-right leading-tight">
                        A recolher
                        <span className="block text-[10px] font-normal text-[var(--muted-foreground)]">
                          (est.)
                        </span>
                      </span>
                    }
                    sortKey="aRecolher"
                    sort={sort}
                    onSortChange={onSortChange}
                    className={cn(APURACAO_MONEY_COL_CLASS, "min-w-[8.5rem]")}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <ApuracaoTableRow key={row.imposto} row={row} />
                ))}
                <tr className="bg-[var(--primary)]/5 font-semibold">
                  <td className={cn(APURACAO_COL_CLASS, "min-w-[7rem]")}>Total estimado</td>
                  <td className={APURACAO_MONEY_COL_CLASS}>—</td>
                  <td className={APURACAO_MONEY_COL_CLASS}>—</td>
                  <td className={APURACAO_MONEY_COL_CLASS}>
                    {formatFinancialMoney(apuracao.pisCofinsLiquido + apuracao.icms.liquido)}
                  </td>
                  <td className={cn(APURACAO_MONEY_COL_CLASS, "min-w-[8.5rem]")}>
                    {formatFinancialMoney(totalARecolher)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {difalUfRows.length > 0 ? (
        <Card className="p-4">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-sm font-semibold"
            onClick={() => setDifalOpen((o) => !o)}
          >
            {difalOpen ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
            DIFAL por UF destino ({difalUfRows.length} UF{difalUfRows.length === 1 ? "" : "s"})
          </button>
          {difalOpen ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                  <th className="py-2 pr-3">UF</th>
                  <SortableTh
                    label="DIFAL estimado"
                    sortKey="valor"
                    sort={difalSort}
                    onSortChange={onDifalSortChange}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedDifalUfs.map(({ uf, valor }) => (
                  <tr key={uf} className="border-b border-[var(--border)]">
                    <td className="py-2 pr-3 font-medium">{uf}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatFinancialMoney(valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      ) : null}

      {apuracao.icmsStRecuperavelEstimado &&
      apuracao.icmsStRecuperavelEstimado > 0 ? (
        <Card className="border-emerald-200 bg-emerald-50/50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="font-medium text-emerald-900 dark:text-emerald-200">
            ICMS-ST recuperável estimado:{" "}
            {formatFinancialMoney(apuracao.icmsStRecuperavelEstimado)}
          </p>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
            Produtos comprados com ICMS-ST e vendidos para outro estado —
            nesses casos o fato gerador presumido (venda dentro da UF de
            origem) não se confirma, e o ICMS-ST pago na entrada é, em tese,
            recuperável (Tema 201/STF, Convênio ICMS 142/2018). Este valor já
            está incluído no crédito de ICMS acima; a recuperação efetiva
            depende do processo de ressarcimento específico de cada estado.
          </p>
        </Card>
      ) : null}

      {diag.linhasSemCustoCadastrado > 0 ? (
        <Card className="border-amber-200 bg-amber-50/50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Créditos possivelmente subestimados
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            {diag.linhasSemCustoCadastrado} venda
            {diag.linhasSemCustoCadastrado === 1 ? "" : "s"} (
            {formatFinancialPercent(pctSemCusto)} da receita) sem custo NF
            cadastrado — crédito PIS/COFINS e ICMS de compra zerados nessas
            linhas.
            {diag.creditoPisCofinsPerdidoEstimado > 0
              ? ` Crédito PIS/COFINS adicional estimado se houvesse custo: ${formatFinancialMoney(diag.creditoPisCofinsPerdidoEstimado)}.`
              : null}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
