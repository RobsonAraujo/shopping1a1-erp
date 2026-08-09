import type { Metadata } from "next";
import { TaxConfigClient } from "@/components/configuracoes-tributarias/tax-config-client";

export const metadata: Metadata = {
  title: "Config. tributária",
};

export default function ConfiguracoesTributariasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Configurações tributárias
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Regime da empresa, UF de origem, alíquotas PIS/COFINS e tabelas de
          ICMS interno / CBS-IBS usadas no relatório mensal.
        </p>
      </div>
      <TaxConfigClient />
    </div>
  );
}
