import { Skeleton as Bar } from "@/components/ui/skeleton";

/**
 * Só aparece no intervalo bem curto antes do primeiro lote de itens/ADS
 * carregar (o que dispara a pré-visualização rápida das linhas — ver
 * `loadFinancialEvaluationRows`). Formato parecido com a linha real da
 * tabela (imagem + título + 3 colunas numéricas), pra não dar a sensação de
 * "página vazia" nesse instante.
 */
export function FinancialEvaluationTableSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-5">
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="size-10 shrink-0 rounded-md" />
            <Bar className="h-4 w-1/3" />
            <Bar className="ml-auto h-4 w-14" />
            <Bar className="h-4 w-16" />
            <Bar className="h-4 w-16" />
            <Bar className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
