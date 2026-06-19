"use client";

import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TaxReportProgressState = {
  phase: "orders" | "billing" | "compute" | "save" | "done" | "error";
  message: string;
  current?: number;
  total?: number;
};

const PHASES: Array<{ id: TaxReportProgressState["phase"]; label: string }> = [
  { id: "orders", label: "Pedidos ML" },
  { id: "billing", label: "Dados fiscais" },
  { id: "compute", label: "Cálculo" },
  { id: "save", label: "Salvando" },
  { id: "done", label: "Concluído" },
];

function phaseIndex(phase: TaxReportProgressState["phase"]): number {
  if (phase === "orders") return 0;
  if (phase === "billing") return 1;
  if (phase === "compute") return 2;
  if (phase === "save") return 3;
  return 4;
}

function progressPercent(progress: TaxReportProgressState): number {
  if (progress.phase === "done") return 100;
  if (progress.phase === "save") return 92;
  if (
    progress.phase === "compute" &&
    progress.total != null &&
    progress.total > 0 &&
    progress.current != null
  ) {
    return 45 + Math.round((progress.current / progress.total) * 45);
  }
  if (progress.phase === "compute") return 55;
  if (
    progress.phase === "billing" &&
    progress.total != null &&
    progress.total > 0 &&
    progress.current != null
  ) {
    return 10 + Math.round((progress.current / progress.total) * 35);
  }
  if (progress.phase === "orders") return 8;
  return 50;
}

export function TaxReportGenerationOverlay({
  progress,
}: {
  progress: TaxReportProgressState;
}) {
  const activeIndex = phaseIndex(progress.phase);
  const percent = progressPercent(progress);
  const showCounter =
    (progress.phase === "billing" || progress.phase === "compute") &&
    progress.total != null &&
    progress.total > 0 &&
    progress.current != null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <Card className="w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Gerando relatório tributário
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {progress.message}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          {showCounter ? (
            <p className="mt-2 text-xs tabular-nums text-[var(--muted-foreground)]">
              {progress.current} de {progress.total}{" "}
              {progress.phase === "billing" ? "pedidos" : "vendas"}
            </p>
          ) : null}
        </div>

        <ol className="mt-5 space-y-2">
          {PHASES.map((step, index) => {
            const done = index < activeIndex || progress.phase === "done";
            const active =
              index === activeIndex &&
              progress.phase !== "done" &&
              progress.phase !== "error";
            return (
              <li
                key={step.id}
                className={cn(
                  "flex items-center gap-2 text-xs",
                  done && "text-emerald-700",
                  active && "font-medium text-[var(--foreground)]",
                  !done && !active && "text-[var(--muted-foreground)]",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                    done && "border-emerald-300 bg-emerald-50",
                    active && "border-[var(--primary)] bg-[var(--primary)]/10",
                    !done && !active && "border-[var(--border)]",
                  )}
                >
                  {done ? "✓" : index + 1}
                </span>
                {step.label}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
