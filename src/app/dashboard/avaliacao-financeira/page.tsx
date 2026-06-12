import { FinancialEvaluationClient } from "@/components/financial-evaluation-client";

export default function FinancialEvaluationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Avaliação financeira
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Margem de contribuição por anúncio com taxa ML, frete e custos
          cadastrados.
        </p>
      </div>

      <FinancialEvaluationClient />
    </div>
  );
}
