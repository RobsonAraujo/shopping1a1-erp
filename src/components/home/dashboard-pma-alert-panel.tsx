import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatFinancialMoney } from "@/lib/financial-margin";
import type { PmaAlertRow } from "@/lib/home/pma-alert-data";

export function DashboardPmaAlertPanel({ rows }: { rows: PmaAlertRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--primary)]">
          Acima do PMA
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Preço atual do anúncio acima do preço máximo autorizado (PMA)
          cadastrado para o produto.
        </p>
      </div>

      <Card className="overflow-hidden border-[var(--border)] border-l-4 border-l-rose-500">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
          <div className="flex items-center gap-2 text-sm font-medium text-rose-900">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Fora do preço combinado
          </div>
          <Badge variant="destructive" className="px-2.5 py-0.5 text-xs">
            {rows.length} {rows.length === 1 ? "anúncio" : "anúncios"}
          </Badge>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.mlItemId}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:bg-[var(--muted)]/20"
              >
                <div className="flex items-start gap-3">
                  <Link
                    href={`/dashboard/items/${row.mlItemId}`}
                    className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                    aria-label={`Abrir detalhes: ${row.title}`}
                  >
                    {row.imageUrl ? (
                      <Image
                        src={row.imageUrl}
                        alt={row.title}
                        width={64}
                        height={64}
                        className="size-14 object-contain sm:size-16"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex size-14 items-center justify-center sm:size-16">
                        <ImageOff
                          className="size-6 text-[var(--muted-foreground)]/70"
                          aria-hidden
                        />
                      </div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Link
                      href={`/dashboard/items/${row.mlItemId}`}
                      className="min-w-0 underline-offset-2 hover:underline"
                      title={row.title}
                    >
                      <span className="block truncate text-sm font-semibold leading-snug text-[var(--primary)] sm:text-base">
                        {row.sku}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-normal leading-snug text-[var(--muted-foreground)]">
                        {row.title}
                      </span>
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      <span>
                        Atual:{" "}
                        <span className="font-semibold text-rose-900">
                          {formatFinancialMoney(row.currentPrice)}
                        </span>
                      </span>
                      <span>
                        PMA:{" "}
                        <span className="font-semibold text-[var(--foreground)]">
                          {formatFinancialMoney(row.pmaPrice)}
                        </span>
                      </span>
                      <Badge
                        variant="destructive"
                        className="h-5 px-2 text-[11px]"
                      >
                        +
                        {row.excessPercent.toLocaleString("pt-BR", {
                          maximumFractionDigits: 0,
                        })}
                        %
                      </Badge>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
