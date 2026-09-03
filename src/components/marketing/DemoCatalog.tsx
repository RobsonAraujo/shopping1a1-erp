import Image from "next/image";

type Status = "winning" | "losing" | "shared";

type Entry = {
  status: Status;
  from: string;
  to: string;
  minutes: number;
  unitsSold: number;
  sellerPrice: string;
  priceToWin: string;
};

const ENTRIES: Entry[] = [
  {
    status: "winning",
    from: "00:00",
    to: "10:20",
    minutes: 620,
    unitsSold: 8,
    sellerPrice: "R$ 189,90",
    priceToWin: "R$ 189,90",
  },
  {
    status: "losing",
    from: "10:20",
    to: "16:45",
    minutes: 385,
    unitsSold: 2,
    sellerPrice: "R$ 199,90",
    priceToWin: "R$ 184,90",
  },
  {
    status: "shared",
    from: "16:45",
    to: "19:00",
    minutes: 135,
    unitsSold: 5,
    sellerPrice: "R$ 189,90",
    priceToWin: "R$ 189,90",
  },
  {
    status: "winning",
    from: "19:00",
    to: "23:59",
    minutes: 299,
    unitsSold: 14,
    sellerPrice: "R$ 184,90",
    priceToWin: "R$ 184,90",
  },
];

const DAY_UNITS = ENTRIES.reduce((s, e) => s + e.unitsSold, 0);
const DAY_MINUTES = ENTRIES.reduce((s, e) => s + e.minutes, 0);

function statusClass(status: Status) {
  if (status === "winning") {
    return "inline-flex rounded-md bg-emerald-600 px-2 py-0.5 font-semibold text-white";
  }
  if (status === "losing") {
    return "inline-flex rounded-md bg-rose-600 px-2 py-0.5 font-semibold text-white";
  }
  return "inline-flex rounded-md bg-amber-500 px-2 py-0.5 font-semibold text-white";
}

function statusLabel(status: Status) {
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  return "Compartilhando";
}

function segmentClass(status: Status) {
  if (status === "winning") return "bg-emerald-500";
  if (status === "losing") return "bg-rose-500";
  return "bg-amber-400";
}

function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatUnitsSold(units: number): string {
  if (units === 0) return "0 vendas";
  if (units === 1) return "1 venda";
  return `${units} vendas`;
}

function Chip({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--background)] px-2.5 py-1 text-xs ring-1 ring-[var(--border)]">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span
        className={`font-semibold tabular-nums ${valueClass ?? "text-[var(--foreground)]"}`}
      >
        {value}
      </span>
    </span>
  );
}

export function DemoCatalog() {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-md">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="relative inline-flex size-14 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]">
            <Image
              src="/marketing/demo-fone.png"
              alt=""
              fill
              sizes="56px"
              className="object-contain"
            />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold">FONE-BT-01</p>
              <span className={statusClass("winning")}>Ganhando</span>
            </div>
            <p className="truncate text-sm text-[var(--muted-foreground)]">
              Fone Bluetooth TWS ANC
            </p>
            <p className="font-mono text-xs text-[var(--muted-foreground)]">
              MLB4120098765
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <p className="text-base font-semibold capitalize">hoje, 22 de ago.</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Total do dia:{" "}
            <span className="font-semibold tabular-nums text-[var(--foreground)]">
              {formatUnitsSold(DAY_UNITS)}
            </span>
          </p>
        </div>
        <div className="space-y-2 p-4">
          <div className="overflow-hidden rounded-md border border-[var(--border)]">
            <div className="flex h-6 w-full">
              {ENTRIES.map((entry) => (
                <div
                  key={`${entry.from}-${entry.status}`}
                  className={segmentClass(entry.status)}
                  style={{ width: `${(entry.minutes / DAY_MINUTES) * 100}%` }}
                  title={`${statusLabel(entry.status)}: ${entry.from} – ${entry.to} (${fmtMinutes(entry.minutes)}) — ${formatUnitsSold(entry.unitsSold)}`}
                />
              ))}
            </div>
          </div>
          {ENTRIES.map((entry) => (
            <div
              key={`${entry.from}-${entry.to}`}
              className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className={statusClass(entry.status)}>
                  {statusLabel(entry.status)}
                </span>
                <span className="text-sm text-[var(--muted-foreground)]">
                  das{" "}
                  <span className="font-medium tabular-nums text-[var(--foreground)]">
                    {entry.from}
                  </span>{" "}
                  às{" "}
                  <span className="font-medium tabular-nums text-[var(--foreground)]">
                    {entry.to}
                  </span>
                  <span className="ml-1.5 text-xs">
                    ({fmtMinutes(entry.minutes)})
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Chip label="Vendas" value={formatUnitsSold(entry.unitsSold)} />
                <Chip label="Meu preço" value={entry.sellerPrice} />
                <Chip
                  label="Para ganhar"
                  value={entry.priceToWin}
                  valueClass="text-[var(--primary)]"
                />
                {entry.status !== "winning" && entry.unitsSold > 0 ? (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    Vendeu mesmo assim
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
