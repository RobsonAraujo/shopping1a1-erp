import Link from "next/link";
import { Calculator } from "lucide-react";

/** Título da página, no padrão da Lucratividade — compacto para os painéis caberem na tela. */
export function CalculatorPageHeader({
  lastCompleteRunLabel,
  dataIsFromToday,
}: {
  lastCompleteRunLabel?: string | null;
  dataIsFromToday?: boolean;
}) {
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
          {lastCompleteRunLabel ? (
            <span className="block text-xs sm:inline">
              <span className="hidden sm:inline"> · </span>
              Custo, imposto e ADS da atualização de {lastCompleteRunLabel}
              {dataIsFromToday === false ? (
                <>
                  {" · "}
                  <Link
                    href="/dashboard/central-anuncios"
                    className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                  >
                    atualizar na Central
                  </Link>
                </>
              ) : null}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
