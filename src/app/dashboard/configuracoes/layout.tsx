import type { Metadata } from "next";
import { ConfiguracoesSubnav } from "@/components/configuracoes/ConfiguracoesSubnav";

export const metadata: Metadata = {
  title: "Configurações",
};

export default function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Configurações
        </h1>
        <p className="mt-1.5 hidden max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)] sm:block">
          Regime, prazos operacionais e parâmetros fiscais usados nos cálculos
          e relatórios.
        </p>
      </header>
      <ConfiguracoesSubnav />
      {children}
    </div>
  );
}
