"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Isolado como Client Component próprio (com seu próprio TooltipProvider)
 * porque renderizar as primitivas do Radix Tooltip direto dentro do JSX de
 * um Server Component (a página de Histórico) causava hydration mismatch —
 * o mesmo padrão usado em InventoryStockTable.tsx funciona porque o
 * Tooltip ali vive inteiro dentro de um Client Component.
 */
export function InventoryAutoCloseInfoTooltip() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex size-4 cursor-pointer items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label="Como funciona o fechamento de estoque"
          >
            <Info className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          O fechamento congela o estoque do mês anterior automaticamente,
          todo início de mês. Precisa de um corte antes disso — por exemplo,
          pra mandar pra contabilidade no meio do mês? Gere um snapshot
          manual do estoque de hoje ao lado; ele fica disponível até o
          fechamento automático oficial deste mês o substituir.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
