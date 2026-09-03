import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type BreadcrumbItem = {
  label: string;
  /** Ausente no último item (página atual, não clicável). */
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const current = items[items.length - 1];
  const parent = items.length > 1 ? items[items.length - 2] : null;

  return (
    <nav aria-label="Breadcrumb">
      {/* Mobile: padrão de navegação nativo — "‹ voltar" para o item pai + título atual. */}
      <div className="sm:hidden">
        {parent ? (
          <Link
            href={parent.href ?? "#"}
            className="-ml-1 inline-flex items-center gap-0.5 py-1 pr-2 text-sm text-[var(--muted-foreground)] active:opacity-60"
          >
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{parent.label}</span>
          </Link>
        ) : null}
        <p className="truncate text-base font-semibold text-[var(--foreground)]">
          {current.label}
        </p>
      </div>

      {/* Desktop/tablet: trilha completa. */}
      <ol className="hidden flex-wrap items-center gap-1.5 text-sm text-[var(--muted-foreground)] sm:flex">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="truncate hover:text-[var(--primary)] hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="truncate text-[var(--foreground)]"
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
