"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatApiErrorMessage } from "@/lib/api/api-client-error";

export type UserFeedbackTone = "error" | "warning" | "success" | "info";

const TONE_STYLES: Record<
  UserFeedbackTone,
  { wrap: string; icon: string; title: string; body: string }
> = {
  error: {
    wrap: "border-rose-200/90 bg-rose-50/90 text-rose-950",
    icon: "bg-rose-100 text-rose-700",
    title: "text-rose-950",
    body: "text-rose-800/90",
  },
  warning: {
    wrap: "border-amber-200/90 bg-amber-50/90 text-amber-950",
    icon: "bg-amber-100 text-amber-800",
    title: "text-amber-950",
    body: "text-amber-900/85",
  },
  success: {
    wrap: "border-emerald-200/90 bg-emerald-50/90 text-emerald-950",
    icon: "bg-emerald-100 text-emerald-800",
    title: "text-emerald-950",
    body: "text-emerald-900/85",
  },
  info: {
    wrap: "border-[var(--border)] bg-[var(--muted)]/50 text-[var(--foreground)]",
    icon: "bg-[var(--background)] text-[var(--muted-foreground)]",
    title: "text-[var(--foreground)]",
    body: "text-[var(--muted-foreground)]",
  },
};

const DEFAULT_TITLE: Record<UserFeedbackTone, string> = {
  error: "Algo deu errado",
  warning: "Atenção",
  success: "Pronto",
  info: "Informação",
};

const ICONS = {
  error: XCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

export function UserFeedback({
  tone = "error",
  title,
  children,
  className,
  onDismiss,
}: {
  tone?: UserFeedbackTone;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Quando informado, mostra um botão de fechar no canto superior direito. */
  onDismiss?: () => void;
}) {
  const styles = TONE_STYLES[tone];
  const Icon = ICONS[tone];
  const message =
    typeof children === "string" && tone === "error"
      ? formatApiErrorMessage(children)
      : children;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-xl border px-3.5 py-3 shadow-sm",
        styles.wrap,
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          styles.icon,
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn("text-sm font-semibold leading-5", styles.title)}>
          {title ?? DEFAULT_TITLE[tone]}
        </p>
        <div className={cn("mt-0.5 text-sm leading-relaxed", styles.body)}>
          {message}
        </div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar"
          className={cn(
            "-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100",
            styles.title,
          )}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
