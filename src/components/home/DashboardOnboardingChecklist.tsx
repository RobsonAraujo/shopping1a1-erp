import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingChecklistState } from "@/lib/onboarding/onboarding-checklist";

export function DashboardOnboardingChecklist({
  state,
}: {
  state: OnboardingChecklistState;
}) {
  if (state.allDone) return null;

  const doneCount = state.steps.filter((step) => step.done).length;

  return (
    <section className="rounded-3xl bg-[var(--card)] px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-[var(--muted-foreground)]">
          Primeiros passos
        </h2>
        <span className="text-sm tabular-nums text-[var(--foreground)]">
          {doneCount}/{state.steps.length}
        </span>
      </div>
      <ol className="grid gap-1 sm:grid-cols-3 sm:gap-0">
        {state.steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(index > 0 && "sm:border-l sm:border-[var(--border)]")}
          >
            <Link
              href={step.href}
              aria-disabled={step.done}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-2 py-2.5 sm:px-4",
                step.done
                  ? "pointer-events-none opacity-50"
                  : "hover:bg-[var(--muted)]/50",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  step.done
                    ? "bg-emerald-500 text-white"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                )}
                aria-hidden
              >
                {step.done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                  {step.label}
                </span>
              </span>
              {!step.done ? (
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
