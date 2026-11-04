"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};

/** O overlay vai num portal no `body` — só existe no navegador. */
export function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

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
  // Antes do contador de vendas: tem que ser o início da faixa (45), senão a
  // barra recua quando o contador começa.
  if (progress.phase === "compute") return 45;
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

const SAVE_HINT_AFTER_SECONDS = 5;

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/**
 * Gravar um mês com muitas vendas leva tempo e o servidor não tem como reportar
 * andamento no meio. Montado só durante "Salvando", então o contador nasce
 * zerado e a mensagem só aparece se a espera for perceptível.
 */
function SaveElapsedHint() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (seconds < SAVE_HINT_AFTER_SECONDS) return null;
  return (
    <p className="mt-2 text-xs tabular-nums text-[var(--muted-foreground)]">
      Salvando há {formatElapsed(seconds)}. Meses com muitas vendas demoram mais.
      Mantenha esta aba aberta.
    </p>
  );
}

/**
 * Bloqueia a tela enquanto o relatório é gerado (busca os pedidos no ML, pode
 * levar minutos), com as etapas e o andamento — o usuário vê o que está
 * acontecendo e não sai da tela no meio.
 */
export function TaxReportGenerationOverlay({
  progress,
  title = "Gerando relatório tributário",
  note,
  onCancel,
}: {
  progress: TaxReportProgressState;
  title?: string;
  /** Explicação curta do que acontece no fim (ex.: o DRE acompanha). */
  note?: string;
  /** Interrompe a geração — nada é gravado antes da etapa "Salvando". */
  onCancel?: () => void;
}) {
  const mounted = useIsClient();
  const activeIndex = phaseIndex(progress.phase);
  const percent = progressPercent(progress);
  const showCounter =
    (progress.phase === "billing" || progress.phase === "compute") &&
    progress.total != null &&
    progress.total > 0 &&
    progress.current != null;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="tax-report-overlay-title"
      aria-describedby="tax-report-overlay-desc"
    >
      <Card className="w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p
              id="tax-report-overlay-title"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              {title}
            </p>
            <p
              id="tax-report-overlay-desc"
              className="mt-1 text-sm text-[var(--muted-foreground)]"
            >
              {progress.message}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
            <div
              className={cn(
                "h-full rounded-full bg-[var(--primary)] transition-all duration-500 ease-out",
                progress.phase === "save" && "animate-pulse",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          {showCounter ? (
            <p className="mt-2 text-xs tabular-nums text-[var(--muted-foreground)]">
              {progress.current} de {progress.total}{" "}
              {progress.phase === "billing" ? "pedidos" : "vendas"}
            </p>
          ) : null}
          {progress.phase === "save" ? <SaveElapsedHint /> : null}
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
        {note ? (
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {note}
          </p>
        ) : null}
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={progress.phase === "save" || progress.phase === "done"}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        ) : null}
      </Card>
    </div>,
    document.body,
  );
}

/**
 * Bloqueia a tela durante as ações curtas (recálculo com as vendas salvas,
 * atualização do imposto do DRE): alguns segundos, só no banco — mas o usuário
 * precisa ver que está rodando e não pode mexer no mês no meio.
 */
export function TaxActionOverlay({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const mounted = useIsClient();
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="tax-action-overlay-title"
      aria-describedby="tax-action-overlay-desc"
    >
      <Card className="w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p
              id="tax-action-overlay-title"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              {title}
            </p>
            <p
              id="tax-action-overlay-desc"
              className="mt-1 text-sm text-[var(--muted-foreground)]"
            >
              {message}
            </p>
          </div>
        </div>
      </Card>
    </div>,
    document.body,
  );
}
