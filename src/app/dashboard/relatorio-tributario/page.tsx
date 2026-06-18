import { MonthlyTaxReportClient } from "@/components/monthly-tax-report-client";

export default function RelatorioTributarioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Relatório tributário mensal
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Apuração por venda com PIS/COFINS, ICMS/DIFAL e estimativa de
          IRPJ/CSLL (Lucro Real). Cada linha mostra de onde vêm os números.
        </p>
      </div>
      <MonthlyTaxReportClient />
    </div>
  );
}
