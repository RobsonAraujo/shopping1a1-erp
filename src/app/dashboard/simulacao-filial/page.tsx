import { BranchSimulationClient } from "@/components/branch-simulation-client";

export default function SimulacaoFilialPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Simulação de filial em outro estado
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Compare o ICMS apurado hoje com um cenário hipotético de vendas
          saindo de outro estado (com ou sem incentivo fiscal), usando o
          histórico real dos relatórios tributários já gerados.
        </p>
      </div>
      <BranchSimulationClient />
    </div>
  );
}
