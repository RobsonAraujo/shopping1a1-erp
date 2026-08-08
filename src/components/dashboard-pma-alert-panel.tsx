import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatFinancialMoney } from "@/lib/financial-margin";
import type { PmaAlertRow } from "@/lib/pma-alert-data";

export function DashboardPmaAlertPanel({ rows }: { rows: PmaAlertRow[] }) {
  if (rows.length === 0) return null;

  return (
    <Card className="overflow-hidden border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-[var(--card)] shadow-md ring-1 ring-amber-100/70">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <CardTitle className="text-lg text-[var(--primary)]">
              Anúncios vendidos acima do PMA
            </CardTitle>
          </div>
          <CardDescription className="max-w-2xl text-sm leading-relaxed">
            Preço atual do anúncio está acima do preço máximo autorizado
            (PMA) cadastrado para o produto.
          </CardDescription>
        </div>
        <Badge variant="warning" className="px-3 py-1 text-sm">
          {rows.length} {rows.length === 1 ? "anúncio" : "anúncios"}
        </Badge>
      </CardHeader>
      <CardContent className="pb-4">
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li
              key={row.mlItemId}
              className="rounded-lg border border-rose-200 bg-rose-50/40 px-3 py-2.5"
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
                      alt=""
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
                    <Badge variant="destructive" className="h-5 px-2 text-[11px]">
                      +{row.excessPercent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                    </Badge>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
