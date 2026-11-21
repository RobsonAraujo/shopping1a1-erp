import { reportsConfig } from "@/config/reports";

const TZ = reportsConfig.catalogCompetitionTimezone;

export function formatUnits(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR");
}

export function formatSignedUnits(value: number): string {
  const abs = Math.abs(value).toLocaleString("pt-BR");
  return value > 0 ? `+${abs}` : value < 0 ? `−${abs}` : "0";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "agora", "há 5 min", "há 2 h", "há 3 dias". */
export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "nunca";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d === 1 ? "" : "s"}`;
}

export function listingTypeLabel(listingTypeId: string | null | undefined): string {
  if (listingTypeId === "gold_special") return "Clássico";
  if (listingTypeId === "gold_pro") return "Premium";
  if (listingTypeId === "free") return "Grátis";
  return listingTypeId ?? "Anúncio";
}

/** Hoje no fuso de São Paulo (`YYYY-MM-DD`), para valor padrão de data. */
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
