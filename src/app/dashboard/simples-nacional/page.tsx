import type { Metadata } from "next";
import { SimplesNacionalClient } from "@/components/simples-nacional/SimplesNacionalClient";

export const metadata: Metadata = {
  title: "Simples Nacional",
};

export default function SimplesNacionalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Tributário — Simples Nacional
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Faixa do DAS por RBT12 (Anexo I — comércio), composição do imposto
          pago e simulação comparando com o regime de Lucro Real.
        </p>
      </div>
      <SimplesNacionalClient />
    </div>
  );
}
