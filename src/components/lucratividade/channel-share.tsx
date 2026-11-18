"use client";

import type { OrderChannel } from "@/lib/mercadolibre/order-channel";
import { SALES_CHANNEL_LABEL } from "@/lib/lucratividade/sales-mix";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import { cn } from "@/lib/utils";

/**
 * Cor fixa de cada canal — slots 1 e 2 da paleta categórica de referência
 * (azul, laranja), validados contra o fundo branco: luminosidade, croma,
 * daltonismo e contraste. A cor segue o canal, nunca a posição — igual no
 * topo e no painel do anúncio.
 */
export const CHANNEL_SWATCH: Record<OrderChannel, string> = {
  retail: "#2a78d6",
  b2b: "#eb6834",
};

export function formatShare(share: number | null): string {
  if (share === null) return "—";
  if (share > 0 && share < 1) return "<1%";
  return `${Math.round(share)}%`;
}

export type ChannelSharePart = {
  channel: OrderChannel;
  revenue: number;
  /** % do faturamento (0–100). */
  revenueShare: number | null;
};

/** Bolinha com a cor do canal (identidade; o texto ao lado diz o nome). */
export function ChannelSwatch({
  channel,
  className,
}: {
  channel: OrderChannel;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: CHANNEL_SWATCH[channel] }}
    />
  );
}

/**
 * Barra fina de 100% (8px, pontas arredondadas, 2px entre as partes, sem
 * texto): os números ficam na lista ao lado. Nome acessível e `title` de cada
 * parte dão canal, valor e participação.
 */
export function ChannelShareBar({
  parts,
  label = "Faturamento por canal",
  className,
}: {
  parts: ChannelSharePart[];
  label?: string;
  className?: string;
}) {
  const visible = parts.filter((part) => part.revenue > 0);
  const description = visible
    .map(
      (part) =>
        `${SALES_CHANNEL_LABEL[part.channel]}: ${formatFinancialMoney(part.revenue)} (${formatShare(part.revenueShare)})`,
    )
    .join("; ");
  return (
    <div
      role="img"
      aria-label={`${label} — ${description}`}
      className={cn("flex h-2 w-full gap-[2px]", className)}
    >
      {visible.map((part) => (
        <span
          key={part.channel}
          title={`${SALES_CHANNEL_LABEL[part.channel]}: ${formatFinancialMoney(part.revenue)} · ${formatShare(part.revenueShare)} do faturamento`}
          className="h-full min-w-[3px] rounded-full"
          style={{
            flexGrow: part.revenue,
            flexBasis: 0,
            backgroundColor: CHANNEL_SWATCH[part.channel],
          }}
        />
      ))}
    </div>
  );
}
