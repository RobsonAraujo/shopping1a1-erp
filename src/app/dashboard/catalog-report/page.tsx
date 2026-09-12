import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { CatalogCompetitionReportClient } from "@/components/catalog-report/CatalogCompetitionReportClient";

export const metadata: Metadata = {
  title: "Catálogo",
};

export default function CatalogReportPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          <Trophy className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Relatório de catálogo
          </h1>
          <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-[15px]">
            Status de competição dos anúncios de catálogo.
          </p>
        </div>
      </div>

      <CatalogCompetitionReportClient />
    </div>
  );
}

