import { Boxes } from "lucide-react";
import type { ReactNode } from "react";
import { StockGuideButton } from "@/components/stock/StockGuide";

export function StockPageHeader({ subtitle, actions }: { subtitle: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          <Boxes className="size-5" aria-hidden />
        </span>
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Estoque</h1>
            <StockGuideButton />
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">{subtitle}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
