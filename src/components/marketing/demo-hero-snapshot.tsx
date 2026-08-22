"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { formatFinancialPercent } from "@/lib/financial-margin";

function statusClass(status: "winning" | "losing" | "shared") {
  if (status === "winning") return "bg-emerald-600";
  if (status === "losing") return "bg-rose-600";
  return "bg-amber-500";
}

const PRODUCTS = [
  {
    title: "Fone Bluetooth TWS",
    sku: "FONE-BT-01",
    image: "/marketing/demo-fone.png",
    marginPct: 28.1,
    afterAdsPct: 21.4,
  },
  {
    title: "Cabo USB-C 2m nylon",
    sku: "CABO-USB-C",
    image: "/marketing/demo-cabo.png",
    marginPct: -4.2,
    afterAdsPct: -11.8,
  },
  {
    title: "Capa MagSafe iPhone 14",
    sku: "CAPA-14",
    image: "/marketing/demo-capa.png",
    marginPct: 19.2,
    afterAdsPct: 14.1,
  },
] as const;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useCountUp(target: number, durationMs: number) {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => true,
  );
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return reduced ? target : value;
}

export function DemoHeroSnapshot() {
  const [productIndex, setProductIndex] = useState(0);
  const sales = useCountUp(29, 1400);
  const product = PRODUCTS[productIndex];

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setProductIndex((i) => (i + 1) % PRODUCTS.length);
    }, 3400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="marketing-hero-stage relative mx-auto w-full max-w-lg lg:max-w-none">
      <div className="marketing-hero-float">
        <div className="marketing-hero-glow pointer-events-none absolute -inset-6 rounded-[1.75rem] bg-amber-400/20 blur-2xl" />
        <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl shadow-black/40">
          <div className="marketing-hero-shine pointer-events-none absolute inset-0 z-10" />
          <div className="relative flex items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2">
            <span className="size-2.5 rounded-full bg-rose-400" aria-hidden />
            <span className="size-2.5 rounded-full bg-amber-400" aria-hidden />
            <span className="size-2.5 rounded-full bg-emerald-400" aria-hidden />
            <span className="ml-2 truncate text-[11px] text-[var(--muted-foreground)]">
              erp1a1.app
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
              <span className="marketing-hero-live size-1.5 rounded-full bg-emerald-500" />
              ao vivo
            </span>
          </div>

          <div className="space-y-3 p-3 sm:p-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Lucratividade
              </p>
              <div className="relative mt-2 min-h-[2.75rem] overflow-hidden">
                <div
                  key={product.sku}
                  className="marketing-hero-product flex items-center gap-3"
                >
                  <Image
                    src={product.image}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.title}</p>
                    <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                      {product.sku}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      Margem
                    </p>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        product.marginPct >= 0
                          ? "text-emerald-600"
                          : "text-rose-600",
                      )}
                    >
                      {formatFinancialPercent(product.marginPct)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      Pós ADS
                    </p>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        product.afterAdsPct >= 0
                          ? "text-emerald-600"
                          : "text-rose-600",
                      )}
                    >
                      {formatFinancialPercent(product.afterAdsPct)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex justify-center gap-1">
                {PRODUCTS.map((p, i) => (
                  <span
                    key={p.sku}
                    className={cn(
                      "h-1 rounded-full transition-all duration-300",
                      i === productIndex
                        ? "w-4 bg-[#1b2d6f]"
                        : "w-1.5 bg-[var(--border)]",
                    )}
                    aria-hidden
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Catálogo · hoje
                </p>
                <p className="text-xs font-semibold tabular-nums">
                  {sales} vendas
                </p>
              </div>
              <div className="mt-2 overflow-hidden rounded-md border border-[var(--border)]">
                <div className="marketing-hero-catalog-bar flex h-5 w-full origin-left">
                  <div className="bg-emerald-500" style={{ width: "43%" }} />
                  <div className="bg-rose-500" style={{ width: "27%" }} />
                  <div className="bg-amber-400" style={{ width: "9%" }} />
                  <div className="bg-emerald-500" style={{ width: "21%" }} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(
                  [
                    ["winning", "Ganhando", "8"],
                    ["losing", "Perdendo", "2"],
                    ["shared", "Compartilhando", "5"],
                    ["winning", "Ganhando", "14"],
                  ] as const
                ).map(([status, label, units], i) => (
                  <span
                    key={`${status}-${i}`}
                    className={cn(
                      "marketing-hero-tag inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white",
                      statusClass(status),
                    )}
                    style={{ animationDelay: `${280 + i * 90}ms` }}
                  >
                    {label}
                    <span className="font-normal opacity-90">{units} vendas</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--border)] text-[11px] font-bold">
              <p className="bg-[var(--muted)]/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                DRE · AGO
              </p>
              <div className="marketing-hero-dre-row flex items-center justify-between bg-[#1c573a] px-3 py-2 text-white">
                <span>(=) Margem de Contribuição</span>
                <span className="tabular-nums">R$ 50.100,00</span>
              </div>
              <div
                className="marketing-hero-dre-row flex items-center justify-between bg-[#d43b4f] px-3 py-2 text-white"
                style={{ animationDelay: "80ms" }}
              >
                <span>(-) Custos Variáveis</span>
                <span className="tabular-nums">−R$ 164.700,00</span>
              </div>
              <div
                className="marketing-hero-dre-row flex items-center justify-between bg-white px-3 py-1.5 pl-5 text-[var(--foreground)]"
                style={{ animationDelay: "160ms" }}
              >
                <span>Tarifa ML</span>
                <span className="tabular-nums">−R$ 28.120,00</span>
              </div>
              <div
                className="marketing-hero-dre-row flex items-center justify-between px-3 py-1.5 pl-5 text-[var(--foreground)]"
                style={{ animationDelay: "240ms", backgroundColor: "#f4f2f7" }}
              >
                <span>Custo produto</span>
                <span className="tabular-nums">−R$ 98.400,00</span>
              </div>
              <div
                className="marketing-hero-dre-row flex items-center justify-between bg-[#1c573a] px-3 py-2 text-white"
                style={{ animationDelay: "320ms" }}
              >
                <span>(=) Lucro Operacional</span>
                <span className="tabular-nums">R$ 38.420,00</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
