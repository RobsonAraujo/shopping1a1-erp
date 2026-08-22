import type { Metadata } from "next";
import { DreClient } from "@/components/dre/dre-client";

export const metadata: Metadata = {
  title: "DRE",
};

export default function DrePage() {
  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[96rem] space-y-6 pb-10">
        <header className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Financeiro
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Resultado
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            DRE mensal: faturamento e custos do Mercado Livre, produto e
            impostos do ERP, custos cadastrados e ADS — do faturamento ao lucro
            operacional.
          </p>
        </header>

        <DreClient />
      </div>
    </div>
  );
}
