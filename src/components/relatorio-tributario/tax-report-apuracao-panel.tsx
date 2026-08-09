"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TaxReportHeaderWithTip } from "@/components/relatorio-tributario/tax-report-transaction-table";
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

export function TaxReportApuracaoPanel({
  apuracao,
  faturamento,
}: {
  apuracao: ApuracaoConsolidada;
  faturamento: number;
}) {
  const [difalOpen, setDifalOpen] = useState(false);

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

  const difalUfs = Object.entries(apuracao.difalPorUf).sort(
    (a, b) => b[1] - a[1],
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-left text-xs text-[var(--muted-foreground)]">
                <th className={cn(APURACAO_COL_CLASS, "min-w-[7rem]")}>Imposto</th>
                <th className={APURACAO_MONEY_COL_CLASS}>Débitos</th>
                <th className={APURACAO_MONEY_COL_CLASS}>Créditos</th>
                <th className={APURACAO_MONEY_COL_CLASS}>Líquido</th>
                <th className={cn(APURACAO_MONEY_COL_CLASS, "min-w-[8.5rem]")}>
                  <span className="inline-block text-right leading-tight">
                    A recolher
                    <span className="block text-[10px] font-normal text-[var(--muted-foreground)]">
                      (est.)
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
      </Card>

      {difalUfs.length > 0 ? (
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
            DIFAL por UF destino ({difalUfs.length} UF{difalUfs.length === 1 ? "" : "s"})
          </button>
          {difalOpen ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                  <th className="py-2 pr-3">UF</th>
                  <th className="py-2 text-right">DIFAL estimado</th>
                </tr>
              </thead>
              <tbody>
                {difalUfs.map(([uf, valor]) => (
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
