"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { COST_COLOR, PROFIT_COLOR } from "@/components/marketing/cost-palette";
import { cn } from "@/lib/utils";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";

/**
 * Miniatura do painel no hero. Três telas reais do produto com números de
 * exemplo, os mesmos que aparecem nas demos maiores mais abaixo na página,
 * para quem rolar não encontrar dois valores diferentes para a mesma coisa.
 */

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const ROTATE_MS = 6000;

const TABS = ["lucratividade", "dre", "catalogo"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  lucratividade: "Lucratividade",
  dre: "DRE",
  catalogo: "Catálogo",
};

/* -------------------------------------------------------------- estrutura */

function PanelShell({
  eyebrow,
  aside,
  footnote,
  children,
}: {
  eyebrow: string;
  aside?: React.ReactNode;
  footnote: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          {eyebrow}
        </p>
        {aside}
      </div>
      <div className="mt-5 flex-1">{children}</div>
      <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {footnote}
      </p>
    </div>
  );
}

/* --------------------------------------------------------- lucratividade */

const ROWS = [
  {
    product: "Fone Bluetooth TWS ANC",
    sku: "FONE-BT-01",
    type: "Catálogo",
    image: "/marketing/demo-fone.png",
    marginPct: 28.1,
    afterAdsPct: 21.4,
  },
  {
    product: "Capa MagSafe iPhone 14",
    sku: "CAPA-14",
    type: "Premium",
    image: "/marketing/demo-capa.png",
    marginPct: 19.2,
    afterAdsPct: 14.1,
  },
  {
    product: "Cabo USB-C 2m nylon",
    sku: "CABO-USB-C",
    type: "Clássico",
    image: "/marketing/demo-cabo.png",
    marginPct: -4.2,
    afterAdsPct: -11.8,
  },
] as const;

/** Quanto o ADS come, em média, nas linhas exibidas, conferível na tabela. */
const AVG_ADS_DROP =
  ROWS.reduce((sum, row) => sum + (row.marginPct - row.afterAdsPct), 0) /
  ROWS.length;

/**
 * Pós ADS dia a dia do anúncio em destaque, ao longo de agosto. O último ponto
 * é o mesmo 21,40% exibido em destaque, e a média é calculada da série, não
 * digitada, para os dois números nunca divergirem.
 */
const DAILY_AFTER_ADS = [
  17.2, 17.8, 16.9, 18.1, 18.6, 17.4, 16.2, 15.8, 16.5, 15.1, 14.9, 15.6, 16.8,
  17.2, 18.0, 18.9, 19.4, 18.7, 19.8, 20.3, 19.6, 20.1, 21.0, 20.4, 19.9, 20.8,
  21.6, 20.9, 21.1, 21.4,
] as const;

const MONTH_AVERAGE =
  DAILY_AFTER_ADS.reduce((sum, value) => sum + value, 0) /
  DAILY_AFTER_ADS.length;

/* Sparkline: cinza de de-ênfase na série, acento só no ponto de hoje. */
const SPARK = { width: 132, height: 36, top: 5, bottom: 31 } as const;
const SPARK_LINE_COLOR = "#64748b";
const SPARK_AVG_COLOR = "#cbd5e1";

function buildSpark() {
  const low = Math.min(...DAILY_AFTER_ADS) - 1;
  const high = Math.max(...DAILY_AFTER_ADS) + 1;
  const stepX = (SPARK.width - 4) / (DAILY_AFTER_ADS.length - 1);
  const toY = (value: number) =>
    SPARK.bottom - ((value - low) / (high - low)) * (SPARK.bottom - SPARK.top);

  const points = DAILY_AFTER_ADS.map((value, i) => ({
    x: 2 + i * stepX,
    y: toY(value),
  }));
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];

  return {
    line,
    area: `${line} L${last.x.toFixed(1)},${SPARK.height} L${points[0].x.toFixed(1)},${SPARK.height} Z`,
    averageY: toY(MONTH_AVERAGE),
    last,
  };
}

const SPARK_GEO = buildSpark();

function toneClass(value: number) {
  return value < 0 ? "text-rose-600" : "text-emerald-600";
}

function MonthTrend() {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-[var(--foreground)]">
          Pós ADS dia a dia
        </p>
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Média de agosto{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {formatFinancialPercent(Number(MONTH_AVERAGE.toFixed(2)))}
          </span>
        </p>
      </div>

      <svg
        viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
        width={SPARK.width}
        height={SPARK.height}
        className="shrink-0"
        role="img"
        aria-label={`Margem pós ADS ao longo de agosto: média de ${MONTH_AVERAGE.toFixed(2).replace(".", ",")}%, terminando o mês em ${ROWS[0].afterAdsPct.toFixed(2).replace(".", ",")}%.`}
      >
        <path d={SPARK_GEO.area} fill={SPARK_LINE_COLOR} fillOpacity={0.07} />
        <line
          x1={0}
          x2={SPARK.width}
          y1={SPARK_GEO.averageY}
          y2={SPARK_GEO.averageY}
          stroke={SPARK_AVG_COLOR}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <path
          d={SPARK_GEO.line}
          fill="none"
          stroke={SPARK_LINE_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Anel da superfície separa o ponto de hoje da linha por baixo */}
        <circle
          cx={SPARK_GEO.last.x}
          cy={SPARK_GEO.last.y}
          r={3.5}
          fill={PROFIT_COLOR}
          stroke="#ffffff"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

function LucratividadePanel() {
  const [featured, ...rest] = ROWS;
  const drop = featured.marginPct - featured.afterAdsPct;

  return (
    <PanelShell
      eyebrow="Lucratividade · por anúncio"
      footnote={
        <>
          O Product Ads leva {AVG_ADS_DROP.toFixed(1).replace(".", ",")} p.p. em
          média aqui, e joga o cabo no vermelho.
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Image
          src={featured.image}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-lg border border-[var(--border)] object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
            {featured.product}
          </p>
          <p className="truncate text-[11px] text-[var(--muted-foreground)]">
            <span className="font-mono">{featured.sku}</span> · {featured.type}
          </p>
        </div>
      </div>

      {/* A conta que a maioria faz → a conta depois do ADS */}
      <div className="mt-4 flex items-end gap-3 sm:gap-4">
        <div>
          <p className="text-[11px] text-[var(--muted-foreground)]">Margem</p>
          <p className="mt-1.5 text-[2.1rem] font-bold leading-none text-[var(--foreground)]/35 sm:text-[2.35rem]">
            {formatFinancialPercent(featured.marginPct)}
          </p>
        </div>
        <ArrowRight
          className="mb-1.5 size-4 shrink-0 text-[var(--muted-foreground)]/50"
          aria-hidden
        />
        <div>
          <p className="text-[11px] font-semibold text-[var(--foreground)]">
            Pós ADS
          </p>
          <p className="mt-1.5 text-[2.1rem] font-bold leading-none text-emerald-600 sm:text-[2.35rem]">
            {formatFinancialPercent(featured.afterAdsPct)}
          </p>
        </div>
        <span className="mb-0.5 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-rose-700">
          −{drop.toFixed(1).replace(".", ",")} p.p.
        </span>
      </div>

      <MonthTrend />

      <div className="mt-4 space-y-1">
        <div className="flex items-center justify-between gap-3 px-2 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
          <span>Outros anúncios</span>
          <span className="flex gap-4">
            <span className="w-16 text-right">Margem</span>
            <span className="w-16 text-right">Pós ADS</span>
          </span>
        </div>
        {rest.map((row) => {
          const negative = row.afterAdsPct < 0;
          return (
            <div
              key={row.sku}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs",
                negative && "bg-rose-50/70",
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Image
                  src={row.image}
                  alt=""
                  width={24}
                  height={24}
                  className="size-6 shrink-0 rounded border border-[var(--border)] object-cover"
                />
                <span className="truncate text-[var(--foreground)]">
                  {row.product}
                </span>
              </span>
              <span className="flex gap-4">
                <span
                  className={cn(
                    "w-16 text-right font-semibold tabular-nums",
                    toneClass(row.marginPct),
                  )}
                >
                  {formatFinancialPercent(row.marginPct)}
                </span>
                <span
                  className={cn(
                    "w-16 text-right font-semibold tabular-nums",
                    toneClass(row.afterAdsPct),
                  )}
                >
                  {formatFinancialPercent(row.afterAdsPct)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

/* -------------------------------------------------------------------- DRE */

const REVENUE = 214800;
const PROFIT_LAST_MONTH = 32200;

/**
 * As fatias somam exatamente a receita, o mesmo fechamento da seção de DRE
 * mais abaixo (receita − custos = lucro operacional).
 */
const SLICES = [
  { label: "Lucro operacional", value: 38420, color: PROFIT_COLOR },
  { label: "Custo do produto", value: 98400, color: COST_COLOR.productCost },
  { label: "Tarifa ML", value: 28120, color: COST_COLOR.mlFee },
  { label: "Product Ads", value: 10000, color: COST_COLOR.ads },
  { label: "Imposto", value: 28180, color: COST_COLOR.tax },
  { label: "Custos fixos", value: 11680, color: COST_COLOR.fixedCost },
] as const;

const PROFIT = SLICES[0];
const PROFIT_GROWTH =
  ((PROFIT.value - PROFIT_LAST_MONTH) / PROFIT_LAST_MONTH) * 100;

function conicGradient() {
  let cumulative = 0;
  const stops = SLICES.map((slice) => {
    const start = (cumulative / REVENUE) * 360;
    cumulative += slice.value;
    const end = (cumulative / REVENUE) * 360;
    return `${slice.color} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function DrePanel() {
  return (
    <PanelShell
      eyebrow="DRE · agosto"
      aside={
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700">
          <ArrowUpRight className="size-3" aria-hidden />
          {PROFIT_GROWTH.toFixed(1).replace(".", ",")}% vs julho
        </span>
      }
      footnote="Receita menos custos, fechando com a fatura do Mercado Livre, sem exportar planilha."
    >
      <div className="flex items-center gap-5 sm:gap-6">
        <div
          className="relative size-28 shrink-0 rounded-full sm:size-32"
          style={{ background: conicGradient() }}
          aria-hidden
        >
          <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center">
            <p className="text-[9px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Lucro
            </p>
            <p className="text-lg font-bold leading-none tabular-nums text-emerald-600">
              {formatFinancialPercent((PROFIT.value / REVENUE) * 100)}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Receita de agosto
          </p>
          <p className="text-2xl font-bold tabular-nums text-[var(--foreground)]">
            {formatFinancialMoney(REVENUE)}
          </p>
          <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
            Sobrou
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600">
            {formatFinancialMoney(PROFIT.value)}
          </p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-2">
        {SLICES.map((slice) => (
          <div
            key={slice.label}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <dt className="flex min-w-0 items-center gap-1.5 text-[var(--muted-foreground)]">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
                aria-hidden
              />
              <span className="truncate">{slice.label}</span>
            </dt>
            <dd className="shrink-0 font-semibold tabular-nums text-[var(--foreground)]">
              {formatFinancialPercent((slice.value / REVENUE) * 100)}
            </dd>
          </div>
        ))}
      </dl>
    </PanelShell>
  );
}

/* --------------------------------------------------------------- catálogo */

type CatalogStatus = "winning" | "losing" | "shared";

const TIMELINE: {
  status: CatalogStatus;
  range: string;
  span: number;
  sales: number;
}[] = [
  { status: "winning", range: "00:00–10:20", span: 43, sales: 8 },
  { status: "losing", range: "10:20–16:45", span: 27, sales: 2 },
  { status: "shared", range: "16:45–19:00", span: 9, sales: 5 },
  { status: "winning", range: "19:00–23:59", span: 21, sales: 14 },
];

const TOTAL_SALES = TIMELINE.reduce((sum, entry) => sum + entry.sales, 0);
const SALES_WHILE_NOT_WINNING = TIMELINE.filter(
  (entry) => entry.status !== "winning",
).reduce((sum, entry) => sum + entry.sales, 0);

function statusClass(status: CatalogStatus) {
  if (status === "winning") return "bg-emerald-500";
  if (status === "losing") return "bg-rose-500";
  return "bg-amber-400";
}

function statusLabel(status: CatalogStatus) {
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  return "Dividindo";
}

function CatalogoPanel() {
  return (
    <PanelShell
      eyebrow="Catálogo · hoje, minuto a minuto"
      aside={
        <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
          FONE-BT-01
        </span>
      }
      footnote="Lançou um produto novo? Vender mesmo sem o buybox é sinal de demanda própria, não só de preço vencedor."
    >
      <div>
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Vendas sem estar ganhando o buybox
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-[var(--foreground)]">
          {SALES_WHILE_NOT_WINNING}
          <span className="ml-1.5 text-base font-medium text-[var(--muted-foreground)]">
            de {TOTAL_SALES}
          </span>
        </p>
      </div>

      <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full">
        {TIMELINE.map((entry) => (
          <div
            key={entry.range}
            className={statusClass(entry.status)}
            style={{ width: `${entry.span}%` }}
          />
        ))}
      </div>

      <div className="mt-5 space-y-1">
        {TIMELINE.map((entry) => (
          <div
            key={entry.range}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  statusClass(entry.status),
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
            <span className="shrink-0 font-semibold tabular-nums text-[var(--foreground)]">
              {entry.sales} vendas
            </span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ shell */

const PANEL: Record<Tab, () => React.ReactElement> = {
  lucratividade: LucratividadePanel,
  dre: DrePanel,
  catalogo: CatalogoPanel,
};

export function DemoHeroSnapshot() {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => true,
  );
  const [active, setActive] = useState<Tab>("lucratividade");
  /** Mouse/foco sobre o painel pausa; clicar numa aba encerra o giro de vez. */
  const [paused, setPaused] = useState(false);
  const [pinned, setPinned] = useState(false);

  const rotating = !reduced && !paused && !pinned;

  useEffect(() => {
    if (!rotating) return;
    const id = window.setInterval(() => {
      setActive((current) => TABS[(TABS.indexOf(current) + 1) % TABS.length]);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rotating]);

  const selectTab = (tab: Tab) => {
    setActive(tab);
    setPinned(true);
  };

  const Panel = PANEL[active];

  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div
        className="marketing-hero-glow pointer-events-none absolute -inset-8 rounded-[2rem] bg-cyan-400/15 blur-2xl"
        aria-hidden
      />

      <div
        className="relative overflow-hidden rounded-2xl border border-white/15 bg-white shadow-2xl shadow-black/40"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {/* Barra do app: dá a leitura de "isto é o painel", não um gráfico */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Image
              src="/logo-bg-blue.png"
              alt=""
              width={20}
              height={20}
              className="size-5 shrink-0 rounded-md object-cover"
            />
            <span className="truncate text-xs font-semibold tracking-tight text-[var(--foreground)]">
              ERP 1a1
            </span>
            <span className="hidden truncate rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)] sm:inline">
              Agosto 2026
            </span>
          </div>
          <span className="shrink-0 rounded-md bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Demonstração
          </span>
        </div>

        {/* Abas no mesmo padrão segmentado do painel */}
        <div className="border-b border-[var(--border)] px-3 py-2.5 sm:px-4">
          <div
            role="tablist"
            aria-label="Telas do painel"
            className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-1"
          >
            {TABS.map((tab) => {
              const selected = active === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`hero-tab-${tab}`}
                  aria-selected={selected}
                  aria-controls={`hero-panel-${tab}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectTab(tab)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                      return;
                    event.preventDefault();
                    const step = event.key === "ArrowRight" ? 1 : -1;
                    const next =
                      TABS[
                        (TABS.indexOf(active) + step + TABS.length) % TABS.length
                      ];
                    selectTab(next);
                    document.getElementById(`hero-tab-${next}`)?.focus();
                  }}
                  className={cn(
                    "relative cursor-pointer overflow-hidden rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:text-xs",
                    selected
                      ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                  )}
                >
                  {TAB_LABEL[tab]}
                  {/* Mostra que a tela vai virar sozinha; some ao pausar/fixar */}
                  {selected && rotating ? (
                    <span
                      key={active}
                      className="marketing-hero-progress absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[var(--primary)]/35"
                      style={{ animationDuration: `${ROTATE_MS}ms` }}
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div
          key={active}
          role="tabpanel"
          id={`hero-panel-${active}`}
          aria-labelledby={`hero-tab-${active}`}
          /* Piso único: sem isso o card muda de altura a cada troca de aba e
             empurra o hero inteiro. Medido contra a aba mais alta. */
          className="marketing-hero-panel min-h-[29.5rem] p-5 sm:min-h-[28.5rem] sm:p-6"
        >
          <Panel />
        </div>
      </div>
    </div>
  );
}
