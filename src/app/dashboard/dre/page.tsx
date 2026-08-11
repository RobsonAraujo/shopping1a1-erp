import type { Metadata } from "next";
import { DreClient } from "@/components/dre/dre-client";

export const metadata: Metadata = {
  title: "DRE",
};

export default function DrePage() {
  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[96rem] space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
            DRE
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Demonstrativo de resultado por mês — faturamento e custos do Mercado
            Livre, custos de produto e impostos do ERP, custos fixos cadastrados
            e campanhas ADS.
          </p>
        </div>

        <DreClient />
      </div>
    </div>
  );
}
