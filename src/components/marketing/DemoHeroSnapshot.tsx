"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const TABS = ["dre", "lucratividade", "catalogo"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  dre: "DRE",
  lucratividade: "Lucratividade",
  catalogo: "Catálogo",
};

const REVENUE = 214800;

const PIE_SLICES = [
  { label: "Lucro operacional", value: 38420, color: "#10b981" },
  { label: "Tarifa ML", value: 28120, color: "#fda4af" },
  { label: "Custo produto", value: 98400, color: "#e11d48" },
  { label: "ADS", value: 10000, color: "#fb7185" },
  { label: "Custos fixos", value: 11680, color: "#cbd5e1" },
];

const PIE_TOTAL = PIE_SLICES.reduce((sum, slice) => sum + slice.value, 0);

function buildConicGradient(
  slices: typeof PIE_SLICES,
  total: number,
): string {
  let cumulative = 0;
  const stops = slices.map((slice) => {
    const start = (cumulative / total) * 360;
    cumulative += slice.value;
    const end = (cumulative / total) * 360;
    return `${slice.color} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

const LUCRATIVIDADE_ROWS = [
  {
    product: "Fone Bluetooth TWS ANC",
    sku: "FONE-BT-01",
    marginPct: 28.1,
    afterAdsPct: 21.4,
  },
  {
    product: "Capa MagSafe iPhone 14",
    sku: "CAPA-14",
    marginPct: 19.2,
    afterAdsPct: 14.1,
  },
  {
    product: "Cabo USB-C 2m nylon",
    sku: "CABO-USB-C",
    marginPct: -4.2,
    afterAdsPct: -11.8,
  },
];

type CatalogStatus = "winning" | "losing" | "shared";

const CATALOG_SEGMENTS: { status: CatalogStatus; pct: number }[] = [
  { status: "winning", pct: 43 },
  { status: "losing", pct: 27 },
  { status: "shared", pct: 9 },
  { status: "winning", pct: 21 },
];

const CATALOG_TIMELINE: {
  status: CatalogStatus;
  range: string;
  sales: number;
}[] = [
  { status: "winning", range: "00:00–10:20", sales: 8 },
  { status: "losing", range: "10:20–16:45", sales: 2 },
  { status: "shared", range: "16:45–19:00", sales: 5 },
  { status: "winning", range: "19:00–23:59", sales: 14 },
];

function segmentClass(status: CatalogStatus) {
  if (status === "winning") return "bg-emerald-500";
  if (status === "losing") return "bg-rose-500";
  return "bg-amber-400";
}

function statusLabel(status: CatalogStatus) {
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  return "Compartilhando";
}

function DrePanel() {
  const lucro = PIE_SLICES[0];
  const gradient = buildConicGradient(PIE_SLICES, PIE_TOTAL);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Receita → lucro · agosto
      </p>
      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
        <div
          className="relative size-32 shrink-0 rounded-full sm:size-36"
          style={{ background: gradient }}
          aria-hidden
        >
          <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-white text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Lucro
            </p>
            <p className="text-lg font-bold tabular-nums text-emerald-600 sm:text-xl">
              {formatFinancialPercent((lucro.value / REVENUE) * 100)}
            </p>
          </div>
        </div>
        <div className="w-full flex-1 space-y-2.5">
          {PIE_SLICES.map((slice) => (
            <div
              key={slice.label}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2 text-[var(--muted-foreground)]">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden
                />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-[var(--foreground)]">
                {formatFinancialMoney(slice.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-[var(--muted-foreground)]">
        Fecha sozinho com a fatura do Mercado Livre — sem exportar planilha.
      </p>
    </div>
  );
}

function LucratividadePanel() {
  const [featured, ...rest] = LUCRATIVIDADE_ROWS;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Lucratividade em tempo real
      </p>
      <p className="mt-3 truncate text-sm font-semibold text-[var(--foreground)]">
        {featured.product}
      </p>
      <p className="font-mono text-xs text-[var(--muted-foreground)]">
        {featured.sku}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Margem</p>
          <p className="mt-2 text-4xl font-bold tabular-nums text-emerald-600 sm:text-5xl">
            {formatFinancialPercent(featured.marginPct)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Pós ADS</p>
          <p className="mt-2 text-4xl font-bold tabular-nums text-emerald-600 sm:text-5xl">
            {formatFinancialPercent(featured.afterAdsPct)}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-2.5 border-t border-[var(--border)] pt-4">
        <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
          <span>Outros anúncios</span>
          <span className="flex gap-6">
            <span className="w-14 text-right">Margem</span>
            <span className="w-14 text-right">Pós ADS</span>
          </span>
        </div>
        {rest.map((row) => (
          <div
            key={row.sku}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">
              {row.product}
            </span>
            <span className="flex gap-6">
              <span
                className={cn(
                  "w-14 text-right font-semibold tabular-nums",
                  row.marginPct >= 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {formatFinancialPercent(row.marginPct)}
              </span>
              <span
                className={cn(
                  "w-14 text-right font-semibold tabular-nums",
                  row.afterAdsPct >= 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {formatFinancialPercent(row.afterAdsPct)}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-[var(--muted-foreground)]">
        Recalculada a cada venda — mesmo depois do Product Ads comer parte da
        margem.
      </p>
    </div>
  );
}

function CatalogoPanel() {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Catálogo · hoje, minuto a minuto
        </p>
        <p className="text-sm font-semibold tabular-nums">29 vendas</p>
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-[var(--border)]">
        <div className="flex h-3.5 w-full">
          {CATALOG_SEGMENTS.map((segment, i) => (
            <div
              key={i}
              className={segmentClass(segment.status)}
              style={{ width: `${segment.pct}%` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        {CATALOG_TIMELINE.map((entry) => (
          <div
            key={entry.range}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  segmentClass(entry.status),
                )}
                aria-hidden
              />
              <span className="font-medium text-[var(--foreground)]">
                {statusLabel(entry.status)}
              </span>
              <span className="tabular-nums text-[var(--muted-foreground)]">
                {entry.range}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-semibold tabular-nums text-[var(--foreground)]">
                {entry.sales} vendas
              </span>
              {entry.status !== "winning" ? (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Vendeu mesmo assim
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-[var(--muted-foreground)]">
        Lançou um produto novo? Veja se ele vende de verdade, mesmo perdendo o
        buybox.
      </p>
    </div>
  );
}

export function DemoHeroSnapshot() {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => true,
  );
  const [active, setActive] = useState<Tab>("dre");

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setActive((current) => {
        const i = TABS.indexOf(current);
        return TABS[(i + 1) % TABS.length];
      });
    }, 4500);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div
        className="marketing-hero-glow pointer-events-none absolute -inset-8 rounded-[2rem] bg-cyan-400/15 blur-2xl"
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 sm:px-4">
          <div className="inline-flex rounded-full bg-[var(--muted)] p-1">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActive(tab)}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:text-xs",
                  active === tab
                    ? "bg-white text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
              >
                {TAB_LABEL[tab]}
              </button>
            ))}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <span className="marketing-hero-live size-1.5 rounded-full bg-emerald-500" />
            Ao vivo
          </span>
        </div>

        <div
          key={active}
          className="marketing-hero-panel flex min-h-[22rem] flex-col justify-center p-6 sm:min-h-[26rem] sm:p-8"
        >
          {active === "dre" ? <DrePanel /> : null}
          {active === "lucratividade" ? <LucratividadePanel /> : null}
          {active === "catalogo" ? <CatalogoPanel /> : null}
        </div>
      </div>
    </div>
  );
}
