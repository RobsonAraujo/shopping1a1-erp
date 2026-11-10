"use client";

import { useMemo, useState } from "react";
import { Calculator, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { SegmentTag } from "@/components/rotina/SegmentTag";
import { STATUS_PILL_CLASS } from "@/components/rotina/rule-visuals";
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

const CATALOG_TONE = {
  winning: "ok",
  losing: "danger",
  shared: "warning",
} as const;

function CatalogPill({ status }: { status: CatalogLiveStatus | null }) {
  if (!status || status === "unknown") {
    return <span className="text-[var(--muted-foreground)]">—</span>;
  }
  const tone = STATUS_PILL_CLASS[CATALOG_TONE[status]];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone.wrap,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {CATALOG_LABEL[status]}
    </span>
  );
}

function segmentOf(row: RotinaListingRow) {
  return row.catalogListing ? ("catalog" as const) : ("own" as const);
}

const TH_CLASS = "px-3 py-2.5 font-medium";

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
      <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
        Ainda não há retrato dos anúncios. Clique em Atualizar para a primeira leitura.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            aria-hidden
          />
          <FormInput
            aria-label="Buscar anúncio"
            placeholder="Buscar por título, SKU ou MLB"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            inputClassName="pl-9 bg-[var(--card)]"
          />
        </div>
        <p className="px-1 text-xs tabular-nums text-[var(--muted-foreground)]" aria-live="polite">
          {visible.length === 1 ? "1 anúncio" : `${visible.length} anúncios`}
          {query.trim() ? ` para “${query.trim()}”` : ""}
        </p>
      </div>

      {/* Mobile: cartões */}
      <ul className="space-y-2 sm:hidden">
        {visible.map((row) => (
          <li
            key={row.mlItemId}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs"
          >
            <div className="flex gap-3">
              <RotinaThumb src={row.imageUrl} size={44} className="size-11" />
              <div className="min-w-0 flex-1">
                <a
                  href={row.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-semibold text-[var(--foreground)]"
                >
                  {row.title}
                </a>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[var(--muted-foreground)]">
                  <SegmentTag segment={segmentOf(row)} />
                  <span className="truncate">{row.sku ?? row.mlItemId}</span>
                  {row.catalogStatus ? <CatalogPill status={row.catalogStatus} /> : null}
                </div>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-[var(--muted)]/35 px-3 py-2 tabular-nums">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Preço</dt>
                <dd className="font-semibold text-[var(--foreground)]">{formatMoney(row.salePrice)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Mínimo</dt>
                <dd className="font-semibold text-[var(--foreground)]">{floorText(row)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">MC</dt>
                <dd className={cn("font-semibold", valueToneClass(row.marginPercent))}>
                  {formatPercent(row.marginPercent)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Após ADS</dt>
                <dd className={cn("font-semibold", valueToneClass(row.marginAfterAdsPercent))}>
                  {formatPercent(row.marginAfterAdsPercent)}
                </dd>
              </div>
            </dl>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => setSimulating(row)}
            >
              <Calculator aria-hidden />
              Simular preço
            </Button>
          </li>
        ))}
      </ul>

      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] sm:block sm:shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className={TH_CLASS}>Anúncio</th>
              <th className={cn(TH_CLASS, "text-right")}>Preço</th>
              <th className={cn(TH_CLASS, "text-right")}>MC</th>
              <th className={cn(TH_CLASS, "text-right")}>Após ADS</th>
              <th className={cn(TH_CLASS, "text-right")}>Mínimo</th>
              <th className={cn(TH_CLASS, "text-right")}>Desc. máx.</th>
              <th className={TH_CLASS}>ADS</th>
              <th className={TH_CLASS}>Catálogo</th>
              <th className={cn(TH_CLASS, "text-right")}>Ações</th>
              <th className="px-3 py-2.5">
                <span className="sr-only">Simular</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.mlItemId}
                className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/25"
              >
                <td className="max-w-[22rem] px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <RotinaThumb src={row.imageUrl} size={40} className="size-10" />
                    <div className="min-w-0">
                      <a
                        href={row.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium text-[var(--foreground)] hover:underline"
                        title={row.title}
                      >
                        {row.title}
                      </a>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                        <SegmentTag segment={segmentOf(row)} />
                        <span className="truncate">
                          {row.sku ?? row.mlItemId} · {formatUnitsRate(row.unitsPerDay)}
                          {row.mlStatus !== "active" ? " · pausado" : ""}
                        </span>
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatMoney(row.salePrice)}
                  {row.hasPromotion ? (
                    <span className="block text-[10px] text-[var(--muted-foreground)]">
                      em promoção
                    </span>
                  ) : null}
                </td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums", valueToneClass(row.marginPercent))}>
                  {formatPercent(row.marginPercent)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right tabular-nums",
                    valueToneClass(row.marginAfterAdsPercent),
                  )}
                >
                  {formatPercent(row.marginAfterAdsPercent)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
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
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {row.floor.maxDiscountPercent !== null ? `${row.floor.maxDiscountPercent}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {row.adsLabel ?? (row.catalogListing ? "—" : "Fora do ADS")}
                  {row.tacosPercent !== null && row.adsLabel === "ADS ativo" ? (
                    <span className="block text-[var(--muted-foreground)]">
                      TACOS {formatPercent(row.tacosPercent)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <CatalogPill status={row.catalogStatus} />
                  {row.priceToWin !== null && row.catalogStatus !== "winning" ? (
                    <span className="mt-0.5 block text-[var(--muted-foreground)]">
                      p/ ganhar {formatMoney(row.priceToWin)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {row.openActions > 0 ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                      {row.openActions}
                    </Badge>
                  ) : (
                    <span className="text-xs text-[var(--muted-foreground)]">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Simular preço de ${row.title}`}
                        onClick={() => setSimulating(row)}
                      >
                        <Calculator aria-hidden />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Simular preço</TooltipContent>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
          Nenhum anúncio encontrado.
        </p>
      ) : null}

      <Sheet open={simulating !== null} onOpenChange={(open) => !open && setSimulating(null)}>
        <SheetContent className="sm:max-w-xl">
          {simulating && simulation ? (
            <>
              <SheetHeader>
                <div className="flex items-start gap-3 pr-8">
                  <RotinaThumb src={simulating.imageUrl} size={48} className="size-12" />
                  <div className="min-w-0">
                    <SheetTitle className="line-clamp-2">{simulating.title}</SheetTitle>
                    <SheetDescription className="mt-1 flex flex-wrap items-center gap-1.5">
                      <SegmentTag segment={segmentOf(simulating)} />
                      <span>
                        {simulating.mlItemId} · hoje a {formatMoney(simulating.salePrice)}
                      </span>
                    </SheetDescription>
                  </div>
                </div>
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
