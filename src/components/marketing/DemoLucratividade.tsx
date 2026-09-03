"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";

function useLiveSeconds(resetAt = 6) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSeconds((s) => (s + 1) % resetAt);
    }, 1000);
    return () => window.clearInterval(id);
  }, [resetAt]);

  return seconds;
}

function marginTone(percent: number) {
  if (percent > 0) return "text-emerald-600";
  if (percent < 0) return "text-rose-600";
  return "text-[var(--muted-foreground)]";
}

const ROWS = [
  {
    title: "Fone Bluetooth TWS ANC",
    sku: "FONE-BT-01",
    image: "/marketing/demo-fone.png",
    type: "Catálogo",
    price: 149.9,
    marginPct: 28.1,
    marginVal: 42.1,
    afterAdsPct: 21.4,
    afterAdsVal: 32.05,
  },
  {
    title: "Cabo USB-C 2m nylon",
    sku: "CABO-USB-C",
    image: "/marketing/demo-cabo.png",
    type: "Clássico",
    price: 29.9,
    marginPct: -4.2,
    marginVal: -1.26,
    afterAdsPct: -11.8,
    afterAdsVal: -3.53,
  },
  {
    title: "Capa MagSafe iPhone 14",
    sku: "CAPA-14",
    image: "/marketing/demo-capa.png",
    type: "Premium",
    price: 89.9,
    marginPct: 19.2,
    marginVal: 17.26,
    afterAdsPct: 14.1,
    afterAdsVal: 12.68,
  },
];

function Stacked({ pct, value }: { pct: number; value: number }) {
  return (
    <div className="text-right">
      <div className={cn("font-semibold", marginTone(pct))}>
        {formatFinancialPercent(pct)}
      </div>
      <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {formatFinancialMoney(value)}
      </div>
    </div>
  );
}

export function DemoLucratividade() {
  const seconds = useLiveSeconds();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Lucratividade
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Situação atual · demonstração
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <span className="marketing-hero-live size-1.5 rounded-full bg-emerald-500" />
          Ao vivo · atualizado há {seconds}s
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] table-fixed border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              <th className="px-3 py-2" colSpan={3} />
              <th
                className="bg-[var(--muted)]/10 px-3 py-2 text-center"
                colSpan={2}
              >
                Situação atual
              </th>
            </tr>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 text-right font-medium">Preço</th>
              <th className="bg-[var(--muted)]/10 px-3 py-2 text-right font-medium">
                Margem
              </th>
              <th className="bg-[var(--muted)]/10 px-3 py-2 text-right font-medium">
                Pós ADS
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.sku} className="border-t border-[var(--border)]">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src={row.image}
                      alt=""
                      width={40}
                      height={40}
                      className="size-10 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0">
                      <span className="font-medium">{row.title}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-[var(--muted-foreground)]">
                        {row.sku}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-[var(--muted-foreground)]">
                  {row.type}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatFinancialMoney(row.price)}
                </td>
                <td className="bg-[var(--muted)]/10 px-3 py-3">
                  <Stacked pct={row.marginPct} value={row.marginVal} />
                </td>
                <td className="bg-[var(--muted)]/10 px-3 py-3">
                  <Stacked pct={row.afterAdsPct} value={row.afterAdsVal} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
