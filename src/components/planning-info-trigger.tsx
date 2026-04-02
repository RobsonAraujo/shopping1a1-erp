"use client";

import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function ExplainerBody({ content }: { content: string }) {
  return (
    <p className="text-left text-xs leading-relaxed text-[var(--foreground)]">
      {content}
    </p>
  );
}

/**
 * Ícone de ajuda: hover mostra tooltip; clique abre popover (melhor em touch).
 */
export function PlanningInfoTrigger({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]",
                className,
              )}
              aria-label="Ver detalhes do cálculo"
            >
              <CircleHelp className="size-4" strokeWidth={2} aria-hidden />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-sm">
          <ExplainerBody content={content} />
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" className="max-w-sm">
        <ExplainerBody content={content} />
      </PopoverContent>
    </Popover>
  );
}
