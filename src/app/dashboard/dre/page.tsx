import { DreClient } from "@/components/dre-client";
import { Badge } from "@/components/ui/badge";

export default function DrePage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
            DRE
          </h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Demonstrativo de resultado por mês — faturamento e custos do Mercado
          Livre, custos de produto e impostos do ERP, custos fixos cadastrados
          e campanhas ADS.
        </p>
      </div>

      <DreClient />
    </div>
  );
}
