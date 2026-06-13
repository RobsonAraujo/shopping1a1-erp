import { DashboardSummaryClient } from "@/components/dashboard-summary-client";

export default function DashboardSummaryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Resumo
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Painéis operacionais para acompanhar o que precisa de atenção no dia a
          dia.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--primary)]">
            Promoções
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Anúncios próprios ativos — sem desconto ou com promoção terminando
            em breve.
          </p>
        </div>
        <DashboardSummaryClient />
      </section>
    </div>
  );
}
