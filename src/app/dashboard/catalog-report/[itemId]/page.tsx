import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogCompetitionItemReportClient } from "@/components/catalog-report/catalog-competition-item-report-client";
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
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/catalog-report" className="gap-1.5">
            <ChevronLeft className="size-4" />
            Voltar para relatório de catálogo
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">
            Timeline detalhada do catálogo
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Item: <span className="font-mono">{itemId}</span>
          </p>
        </div>
      </div>

      <CatalogCompetitionItemReportClient itemId={itemId} />
    </div>
  );
}

