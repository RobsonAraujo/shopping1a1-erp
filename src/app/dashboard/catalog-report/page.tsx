import { CatalogCompetitionReportClient } from "@/components/catalog-competition-report-client";

export default function CatalogReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Relatório de catálogo
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Visão separada de anúncios de catálogo com histórico de ganhando,
          perdendo e compartilhando para os últimos 7 e 30 dias. Clique em um
          anúncio para abrir a timeline detalhada.
        </p>
      </div>

      <CatalogCompetitionReportClient />
    </div>
  );
}

