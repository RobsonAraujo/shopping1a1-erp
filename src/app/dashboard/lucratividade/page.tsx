import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";
import { FinancialEvaluationClient } from "@/components/lucratividade/FinancialEvaluationClient";

export const metadata: Metadata = {
  title: "Lucratividade",
};

export default function LucratividadePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          <TrendingUp className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Lucratividade
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-[15px]">
            Margem de contribuição por anúncio com taxa ML, frete e custos
            cadastrados.
          </p>
        </div>
      </div>

      <FinancialEvaluationClient />
    </div>
  );
}
