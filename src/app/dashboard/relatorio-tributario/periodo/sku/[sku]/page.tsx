import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MonthlyTaxReportSkuClient } from "@/components/monthly-tax-report-sku-client";
import { Button } from "@/components/ui/button";
import { parseTaxReportSkuPeriodParams, taxReportPath } from "@/lib/tax-report/routes";

type PageProps = {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

function formatYmdBr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export default async function RelatorioTributarioSkuPeriodoPage({
  params,
  searchParams,
}: PageProps) {
  const rawParams = await params;
  const rawSearchParams = await searchParams;
  const parsed = parseTaxReportSkuPeriodParams({
    sku: rawParams.sku,
    from: rawSearchParams.from,
    to: rawSearchParams.to,
  });
  if (!parsed) {
    notFound();
  }

  const { from, to, sku } = parsed;
  const periodLabel = `${formatYmdBr(from)} – ${formatYmdBr(to)}`;

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

      <MonthlyTaxReportSkuClient
        year={0}
        month={0}
        sku={sku}
        period={{ from, to }}
      />
    </div>
  );
}
