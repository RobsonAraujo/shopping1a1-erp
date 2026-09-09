import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="border-[var(--primary)]/20 bg-[var(--primary)]/5">
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="text-base font-semibold text-[var(--primary)]">
            Primeiros passos ({doneCount}/{state.steps.length})
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Complete para ver a margem e o resultado do mês da sua loja.
          </p>
        </div>
        <ul className="space-y-2">
          {state.steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                aria-disabled={step.done}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-colors",
                  step.done
                    ? "pointer-events-none opacity-60"
                    : "hover:border-[var(--primary)]/40 hover:bg-[var(--accent)]/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.done
                      ? "bg-emerald-500 text-white"
                      : "border border-[var(--border)] text-[var(--muted-foreground)]",
                  )}
                  aria-hidden
                >
                  {step.done ? <Check className="size-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--foreground)]">
                    {step.label}
                  </span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    {step.description}
                  </span>
                </span>
                {!step.done ? (
                  <ArrowRight
                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
