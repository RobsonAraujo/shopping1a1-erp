import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, LineChart } from "lucide-react";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { CatalogCompetitionItemReportClient } from "@/components/catalog-report/CatalogCompetitionItemReportClient";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: Promise<{ itemId: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { itemId } = await params;
  return { title: `Item ${itemId} · Catálogo` };
}

export default async function CatalogReportItemPage({ params }: PageProps) {
  const { itemId } = await params;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Breadcrumbs
          items={[
            { label: "Início", href: "/dashboard" },
            { label: "Catálogo", href: "/dashboard/catalog-report" },
            { label: itemId },
          ]}
        />
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-[var(--muted-foreground)]">
          <Link href="/dashboard/catalog-report" className="gap-1.5">
            <ChevronLeft className="size-4" />
            Voltar para relatório de catálogo
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <LineChart className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
              Timeline detalhada do catálogo
            </h1>
            <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
              Item: <span className="font-mono text-[var(--foreground)]">{itemId}</span>
            </p>
          </div>
        </div>
      </div>

      <CatalogCompetitionItemReportClient itemId={itemId} />
    </div>
  );
}

