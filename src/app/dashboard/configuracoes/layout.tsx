import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Configurações",
};

export default function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Configurações
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Regime tributário da empresa e parâmetros fiscais usados nos
          cálculos e relatórios.
        </p>
      </div>
      {children}
    </div>
  );
}
