import { DreClient } from "@/components/dre-client";
import { Badge } from "@/components/ui/badge";

export default function DrePage() {
  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[96rem] space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              DRE
            </h1>
            <Badge variant="secondary">Beta</Badge>
          </div>
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
