"use client";

import { PlanningInfoTrigger } from "@/components/planning-info-trigger";
import { cn } from "@/lib/utils";

/**
 * Valor + ícone de ajuda alinhados de forma estável: texto pode quebrar linha
 * sem “subir” o ícone; o ícone fica ancorado ao topo da primeira linha.
 */
export function MetricWithHint({
  children,
  content,
  className,
}: {
  children: React.ReactNode;
  content: string;
  className?: string;
}) {
  return (
    <span
      className={cn("flex min-w-0 items-center  gap-1.5 text-left", className)}
    >
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
      <span>
        <PlanningInfoTrigger
          content={content}
          className="mt-px shrink-0 self-start"
        />
      </span>
    </span>
  );
}
