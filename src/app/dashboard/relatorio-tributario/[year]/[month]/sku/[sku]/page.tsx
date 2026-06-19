import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MonthlyTaxReportSkuClient } from "@/components/monthly-tax-report-sku-client";
import { Button } from "@/components/ui/button";
import {
  parseTaxReportSkuParams,
  TAX_REPORT_MONTH_NAMES,
  taxReportPath,
} from "@/lib/tax-report/routes";

type PageProps = {
  params: Promise<{ year: string; month: string; sku: string }>;
};

export default async function RelatorioTributarioSkuPage({ params }: PageProps) {
  const raw = await params;
  const parsed = parseTaxReportSkuParams(raw);
  if (!parsed) {
    notFound();
  }

  const { year, month, sku } = parsed;
  const periodLabel = `${TAX_REPORT_MONTH_NAMES[month - 1]}/${year}`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={taxReportPath()} className="gap-1.5">
            <ChevronLeft className="size-4" />
            Voltar ao relatório tributário
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">
            Vendas por SKU
          </h1>
          <p className="mt-1 break-words text-sm text-[var(--muted-foreground)]">
            SKU: <span className="font-mono font-medium text-[var(--foreground)]">{sku}</span> ·{" "}
            {periodLabel}
          </p>
        </div>
      </div>

      <MonthlyTaxReportSkuClient year={year} month={month} sku={sku} />
    </div>
  );
}
