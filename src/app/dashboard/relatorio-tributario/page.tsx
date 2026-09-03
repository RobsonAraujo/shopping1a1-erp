import type { Metadata } from "next";
import { MonthlyTaxReportClient } from "@/components/relatorio-tributario/MonthlyTaxReportClient";

export const metadata: Metadata = {
  title: "Tributário",
};

export default function RelatorioTributarioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Relatório tributário mensal
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Apuração por venda com PIS/COFINS e ICMS/DIFAL (Lucro Real). Cada linha
          mostra de onde vêm os números.
        </p>
      </div>
      <MonthlyTaxReportClient />
    </div>
  );
}
