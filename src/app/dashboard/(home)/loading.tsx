import { Skeleton } from "@/components/ui/skeleton";
import { HOME_DASHBOARD_GRID_CLASS } from "@/lib/home/dashboard/widget-registry";
import { cn } from "@/lib/utils";

/**
 * O que aparece no instante do clique para a Home. Mora no route group `(home)`
 * para valer só aqui: num `dashboard/loading.tsx`, este esqueleto substituiria a
 * tela de todas as outras rotas do dashboard também.
 *
 * Dura o tempo de ler o layout salvo. Depois disso a grade certa já está na tela
 * e cada widget mostra o próprio skeleton até o snapshot chegar.
 */
export default function HomeLoading() {
  return (
    <div className="space-y-6 sm:space-y-8" aria-busy="true">
      <div aria-hidden>
        <Skeleton className="h-7 w-48 rounded-lg sm:h-9 sm:w-64" />
        <Skeleton className="mt-1.5 h-4 w-36" />
      </div>

      <div className="flex flex-col gap-3 sm:gap-4" aria-hidden>
        <Skeleton className="h-12 rounded-3xl" />
        <div
          className={cn(
            "grid items-start gap-3 sm:gap-4",
            HOME_DASHBOARD_GRID_CLASS,
          )}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-3xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
