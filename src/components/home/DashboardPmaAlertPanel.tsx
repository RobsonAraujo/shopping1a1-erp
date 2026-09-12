import Image from "next/image";
import { ImageOff } from "lucide-react";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import { sellerListingModifyUrl } from "@/lib/mercadolibre/seller-listing-url";
import type { PmaAlertRow } from "@/lib/home/pma-alert-data";

export function DashboardPmaAlertPanel({ rows }: { rows: PmaAlertRow[] }) {
  if (rows.length === 0) return null;

  const visible = rows.slice(0, 8);

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-[var(--muted-foreground)]">
          Abaixo do PMA
        </h2>
        <span className="text-sm tabular-nums text-rose-700">
          {rows.length}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-3xl bg-[var(--card)]">
        {visible.map((row) => (
          <li key={row.mlItemId}>
            <a
              href={sellerListingModifyUrl(row.mlItemId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--muted)]/40 sm:px-5"
              title="Editar no Mercado Livre"
            >
              <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)] sm:size-12">
                {row.imageUrl ? (
                  <Image
                    src={row.imageUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="size-full object-contain"
                    sizes="48px"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center">
                    <ImageOff
                      className="size-4 text-[var(--muted-foreground)]/70"
                      aria-hidden
                    />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                  {row.sku}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
                  {formatFinancialMoney(row.currentPrice)} · PMA{" "}
                  {formatFinancialMoney(row.pmaPrice)}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-rose-700">
                −
                {row.shortfallPercent.toLocaleString("pt-BR", {
                  maximumFractionDigits: 0,
                })}
                %
              </span>
            </a>
          </li>
        ))}
      </ul>
      {rows.length > 8 ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          + {rows.length - 8} anúncio(s)
        </p>
      ) : null}
    </section>
  );
}
