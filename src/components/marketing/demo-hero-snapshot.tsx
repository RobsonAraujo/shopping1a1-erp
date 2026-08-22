import Image from "next/image";
import { cn } from "@/lib/utils";

function statusClass(status: "winning" | "losing" | "shared") {
  if (status === "winning") return "bg-emerald-600";
  if (status === "losing") return "bg-rose-600";
  return "bg-amber-500";
}

/** Recorte do que o painel realmente mostra — não um dashboard de KPIs genéricos. */
export function DemoHeroSnapshot() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-2xl shadow-black/30">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2">
        <span className="size-2.5 rounded-full bg-rose-400" aria-hidden />
        <span className="size-2.5 rounded-full bg-amber-400" aria-hidden />
        <span className="size-2.5 rounded-full bg-emerald-400" aria-hidden />
        <span className="ml-2 truncate text-[11px] text-[var(--muted-foreground)]">
          erp1a1.app
        </span>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Lucratividade
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Image
              src="/marketing/demo-fone.png"
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Fone Bluetooth TWS</p>
              <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                FONE-BT-01
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[var(--muted-foreground)]">Margem</p>
              <p className="text-sm font-semibold tabular-nums text-emerald-600">
                28,10%
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[var(--muted-foreground)]">Pós ADS</p>
              <p className="text-sm font-semibold tabular-nums text-emerald-600">
                21,40%
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Catálogo · hoje
            </p>
            <p className="text-xs font-semibold tabular-nums">29 vendas</p>
          </div>
          <div className="mt-2 overflow-hidden rounded-md border border-[var(--border)]">
            <div className="flex h-5 w-full">
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
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white",
                  statusClass(status),
                )}
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
          <div className="flex items-center justify-between bg-[#1c573a] px-3 py-2 text-white">
            <span>(=) Margem de Contribuição</span>
            <span className="tabular-nums">R$ 50.100,00</span>
          </div>
          <div className="flex items-center justify-between bg-[#d43b4f] px-3 py-2 text-white">
            <span>(-) Custos Variáveis</span>
            <span className="tabular-nums">−R$ 164.700,00</span>
          </div>
          <div className="flex items-center justify-between bg-white px-3 py-1.5 pl-5 text-[var(--foreground)]">
            <span>Tarifa ML</span>
            <span className="tabular-nums">−R$ 28.120,00</span>
          </div>
          <div
            className="flex items-center justify-between px-3 py-1.5 pl-5 text-[var(--foreground)]"
            style={{ backgroundColor: "#f4f2f7" }}
          >
            <span>Custo produto</span>
            <span className="tabular-nums">−R$ 98.400,00</span>
          </div>
          <div className="flex items-center justify-between bg-[#1c573a] px-3 py-2 text-white">
            <span>(=) Lucro Operacional</span>
            <span className="tabular-nums">R$ 38.420,00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
