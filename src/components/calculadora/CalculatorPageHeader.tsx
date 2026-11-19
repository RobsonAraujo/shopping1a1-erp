import { Calculator } from "lucide-react";

/** Título da página, no padrão da Lucratividade — compacto para os painéis caberem na tela. */
export function CalculatorPageHeader() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
        <Calculator className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
          Calculadora de preço
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
          A margem de qualquer anúncio no preço que você quiser, no Clássico ou no Premium.
          <span className="block text-xs sm:inline">
            <span className="hidden sm:inline"> · </span>
            Cada anúncio é lido agora no Mercado Livre quando você o abre.
          </span>
        </p>
      </div>
    </div>
  );
}
