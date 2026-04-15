import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CatalogCompetitionItemReportClient } from "@/components/catalog-competition-item-report-client";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: Promise<{ itemId: string }>;
};

export default async function CatalogReportItemPage({ params }: PageProps) {
  const { itemId } = await params;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
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

