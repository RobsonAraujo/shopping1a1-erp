/**
 * Canal de uma venda, para exibição no extrato. A decisão "saiu de casa ou do
 * Full" NÃO vem daqui — vem do nó de estoque da linha do pedido
 * (`stock-order-effects.ts`); isto só traduz o `logistic.type` do envio.
 *
 * Conferido nos envios reais (nov/2026): `fulfillment` (Full),
 * `self_service` (Flex), `xd_drop_off` (Agência/Places), `cross_docking`
 * (Coleta; com a tag `proximity` é o Envios Agora, novo no MLB desde
 * 06/2026). `drop_off` é a agência dos Correios; `me1`/`custom`/
 * `not_specified` são envio por conta do vendedor ou a combinar.
 */
export type StockChannel =
  | "full"
  | "flex"
  | "coleta"
  | "envios_agora"
  | "agencia"
  | "proprio";

export const STOCK_CHANNEL_LABEL: Record<StockChannel, string> = {
  full: "Full",
  flex: "Flex",
  coleta: "Coleta",
  envios_agora: "Envios Agora",
  agencia: "Agência",
  proprio: "Envio próprio",
};

/**
 * Canal gravado na movimentação: o `logistic.type` cru, com o sufixo
 * `+proximity` quando o envio é Envios Agora — assim o extrato não precisa
 * reler o envio para separar Coleta de Envios Agora.
 */
export function storedChannelFromShipment(
  logisticType: string | null | undefined,
  tags: readonly string[] = [],
): string | null {
  const type = logisticType?.trim();
  if (!type) return null;
  if (type === "cross_docking" && tags.includes("proximity")) {
    return "cross_docking+proximity";
  }
  return type;
}

/** Canal de exibição a partir do valor gravado na movimentação. */
export function stockChannelFromStored(stored: string | null | undefined): StockChannel | null {
  const value = stored?.trim();
  if (!value) return null;
  if (value === "fulfillment") return "full";
  if (value === "self_service") return "flex";
  if (value === "cross_docking+proximity") return "envios_agora";
  if (value === "cross_docking") return "coleta";
  if (value === "xd_drop_off" || value === "drop_off") return "agencia";
  return "proprio";
}

export function stockChannelLabel(stored: string | null | undefined): string | null {
  const channel = stockChannelFromStored(stored);
  return channel ? STOCK_CHANNEL_LABEL[channel] : null;
}
