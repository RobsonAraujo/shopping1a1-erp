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
    <p className="text-left text-xs leading-relaxed text-[var(--popover-foreground)]">
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
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                className,
              )}
              aria-label="Ver detalhes do cálculo"
            >
              <CircleHelp className="size-[15px]" strokeWidth={2} aria-hidden />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-sm border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-md"
        >
          <ExplainerBody content={content} />
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="start"
        className="max-w-sm border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-md"
      >
        <ExplainerBody content={content} />
      </PopoverContent>
    </Popover>
  );
}
