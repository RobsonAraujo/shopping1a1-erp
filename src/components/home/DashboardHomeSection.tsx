import { CheckCircle2 } from "lucide-react";

/**
 * Casca das seções de alerta da home (PMA, promoções terminando, catálogo
 * perdendo). Título sempre visível, contador opcional à direita.
 */
export function DashboardSection({
  title,
  count,
  tone = "alert",
  children,
}: {
  title: string;
  count?: number;
  tone?: "alert" | "warning";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-[var(--muted-foreground)]">
          {title}
        </h2>
        {count !== undefined ? (
          <span
            className={
              tone === "warning"
                ? "text-sm tabular-nums text-amber-800"
                : "text-sm tabular-nums text-rose-700"
            }
          >
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Corpo "tudo ok" de uma seção. Seção de alerta vazia nunca some da home — o
 * usuário precisa saber que o monitoramento existe e está rodando.
 */
export function DashboardSectionClear({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-3xl bg-[var(--card)] px-4 py-4 sm:px-5"
    >
      <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
      <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
    </div>
  );
}
