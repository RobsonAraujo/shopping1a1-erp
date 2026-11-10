"use client";

import { useMemo, useState } from "react";
import { Calculator, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  RotinaPriceSimulator,
  buildSimulatorSuggestions,
} from "@/components/rotina/RotinaPriceSimulator";
import { formatMoney, formatPercent, formatUnitsRate } from "@/lib/rotina/format";
import type { RotinaListingRow } from "@/lib/rotina/view";
import type { SegmentFilter } from "@/lib/rotina/view-summary";
import type { CatalogLiveStatus } from "@/lib/rotina/types";
import { valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

const CATALOG_LABEL: Record<CatalogLiveStatus, string> = {
  winning: "Ganhando",
  losing: "Perdendo",
  shared: "Dividindo",
  unknown: "—",
};

function matches(row: RotinaListingRow, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    row.title.toLowerCase().includes(needle) ||
    row.mlItemId.toLowerCase().includes(needle) ||
    (row.sku?.toLowerCase().includes(needle) ?? false)
  );
}

function simulatorFor(row: RotinaListingRow) {
  const contested = row.catalogStatus === "losing" || row.catalogStatus === "shared";
  const priceToWin = contested ? row.priceToWin : null;
  return {
    suggestions: buildSimulatorSuggestions({
      priceToWin,
      suggestedPrice: null,
      floor: row.floor,
      salePrice: row.salePrice,
      discounts: row.catalogListing ? undefined : [5, 10, 15, 20],
    }),
    defaultPrice: priceToWin ?? row.floor.effectivePrice ?? row.salePrice,
  };
}

function floorText(row: RotinaListingRow): string {
  if (row.floor.effectivePrice === null) return row.exclusionLabel ?? "—";
  return formatMoney(row.floor.effectivePrice);
}

/**
 * Consulta rápida do preço mínimo de qualquer anúncio — inclusive os que não
 * estão na lista do dia (ex.: vou colocar promoção num anúncio que já tem uma).
 * Sai do mesmo retrato da última atualização: nenhuma chamada ao ML.
 */
export function RotinaAllListingsTable({
  rows,
  segment,
  timeZone,
}: {
  rows: RotinaListingRow[];
  segment: SegmentFilter;
  timeZone: string;
}) {
  const [query, setQuery] = useState("");
  const [simulating, setSimulating] = useState<RotinaListingRow | null>(null);
  const simulation = simulating ? simulatorFor(simulating) : null;
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (segment === "all" ||
            (segment === "catalog" ? row.catalogListing : !row.catalogListing)) &&
          matches(row, query.trim()),
      ),
    [rows, segment, query],
  );

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
        Ainda não há retrato dos anúncios. Clique em Atualizar para a primeira leitura.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <FormInput
          aria-label="Buscar anúncio"
          placeholder="Buscar por título, SKU ou MLB"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputClassName="pl-9"
        />
      </div>

      {/* Mobile: cartões */}
      <ul className="space-y-2 sm:hidden">
        {visible.map((row) => (
          <li
            key={row.mlItemId}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs"
          >
            <a
              href={row.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-semibold text-[var(--foreground)]"
            >
              {row.title}
            </a>
            <p className="text-[var(--muted-foreground)]">
              {row.catalogListing ? "Catálogo" : "Próprio"} · {row.sku ?? row.mlItemId}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
              <span>Preço {formatMoney(row.salePrice)}</span>
              <span>Mínimo {floorText(row)}</span>
              <span className={valueToneClass(row.marginPercent)}>
                MC {formatPercent(row.marginPercent)}
              </span>
              <span className={valueToneClass(row.marginAfterAdsPercent)}>
                Após ADS {formatPercent(row.marginAfterAdsPercent)}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-1 -ml-2"
              onClick={() => setSimulating(row)}
            >
              <Calculator aria-hidden />
              Simular preço
            </Button>
          </li>
        ))}
      </ul>

      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">Anúncio</th>
              <th className="px-3 py-2 text-right font-medium">Preço</th>
              <th className="px-3 py-2 text-right font-medium">MC</th>
              <th className="px-3 py-2 text-right font-medium">Após ADS</th>
              <th className="px-3 py-2 text-right font-medium">Mínimo</th>
              <th className="px-3 py-2 text-right font-medium">Desc. máx.</th>
              <th className="px-3 py-2 font-medium">ADS</th>
              <th className="px-3 py-2 font-medium">Catálogo</th>
              <th className="px-3 py-2 text-right font-medium">Ações</th>
              <th className="px-3 py-2">
                <span className="sr-only">Simular</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.mlItemId} className="border-b border-[var(--border)] last:border-0">
                <td className="max-w-[18rem] px-3 py-2">
                  <a
                    href={row.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-medium text-[var(--foreground)] hover:underline"
                    title={row.title}
                  >
                    {row.title}
                  </a>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">
                    {row.catalogListing ? "Catálogo" : "Próprio"} · {row.sku ?? row.mlItemId} ·{" "}
                    {formatUnitsRate(row.unitsPerDay)}
                    {row.mlStatus !== "active" ? " · pausado" : ""}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(row.salePrice)}
                  {row.hasPromotion ? (
                    <span className="block text-[10px] text-[var(--muted-foreground)]">
                      em promoção
                    </span>
                  ) : null}
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums", valueToneClass(row.marginPercent))}>
                  {formatPercent(row.marginPercent)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    valueToneClass(row.marginAfterAdsPercent),
                  )}
                >
                  {formatPercent(row.marginAfterAdsPercent)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="font-semibold">{floorText(row)}</span>
                  {row.floor.effectivePrice !== null ? (
                    <span className="block text-[10px] text-[var(--muted-foreground)]">
                      p/ {formatPercent(row.floor.targetPercent)}
                      {row.floor.boundBy === "pma" ? " (PMA)" : ""}
                      {row.floor.bands.length > 0 ? " · tem faixa a evitar" : ""}
                      {row.floor.stale ? " · desatualizado" : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.floor.maxDiscountPercent !== null ? `${row.floor.maxDiscountPercent}%` : "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {row.adsLabel ?? (row.catalogListing ? "—" : "Fora do ADS")}
                  {row.tacosPercent !== null && row.adsLabel === "ADS ativo" ? (
                    <span className="block text-[var(--muted-foreground)]">
                      TACOS {formatPercent(row.tacosPercent)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs">
                  {row.catalogStatus ? CATALOG_LABEL[row.catalogStatus] : "—"}
                  {row.priceToWin !== null && row.catalogStatus !== "winning" ? (
                    <span className="block text-[var(--muted-foreground)]">
                      p/ ganhar {formatMoney(row.priceToWin)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.openActions > 0 ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                      {row.openActions}
                    </Badge>
                  ) : (
                    <span className="text-xs text-[var(--muted-foreground)]">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Simular preço de ${row.title}`}
                    title="Simular preço"
                    onClick={() => setSimulating(row)}
                  >
                    <Calculator aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhum anúncio encontrado.</p>
      ) : null}

      <Sheet open={simulating !== null} onOpenChange={(open) => !open && setSimulating(null)}>
        <SheetContent className="sm:max-w-xl">
          {simulating && simulation ? (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{simulating.title}</SheetTitle>
                <SheetDescription>
                  {simulating.catalogListing ? "Catálogo" : "Próprio"} · {simulating.mlItemId} ·
                  hoje a {formatMoney(simulating.salePrice)}
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <RotinaPriceSimulator
                  key={simulating.mlItemId}
                  mlItemId={simulating.mlItemId}
                  suggestions={simulation.suggestions}
                  defaultPrice={simulation.defaultPrice}
                  timeZone={timeZone}
                />
              </SheetBody>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
