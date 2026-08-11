import { roundMoney } from "@/lib/financial-margin";
import { getMercadoLibreConfig } from "./config";

export type MlBillingDreLines = {
  revenueMl: number | null;
  saleFee: number;
  sellerShipping: number;
  cancelledSales: number;
  partialReturns: number;
  fullShipping: number;
  fullStorage: number;
  fullNonCompliance: number;
  adsCost: number;
  /** Tarifa de manutenção da Minha Página (CESM). */
  minhaPagina: number;
  /** Comissão paga a afiliados (CVAF). */
  affiliateFee: number;
};

export function normalizeBillingLabel(label: string | undefined): string {
  return (label ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** True para `BONUS` e variantes da API (`BONUS_ON_BILL`, `BONUS_PART_ON_CREDIT_NOTE`, …). */
export function isBillingBonusType(detailType: string | undefined): boolean {
  const t = (detailType ?? "").toUpperCase();
  return t === "BONUS" || t.startsWith("BONUS_");
}

function matchAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isFullChargeLabel(label: string): boolean {
  return matchAny(label, [/full/, /fulfillment/]);
}

export function classifyFullChargeLabel(
  label: string,
): "fullShipping" | "fullStorage" | "fullNonCompliance" | null {
  if (!isFullChargeLabel(label)) return null;

  if (
    matchAny(label, [
      /armazen/,
      /storage/,
      /warehous/,
      /estoque/,
    ])
  ) {
    return "fullStorage";
  }

  if (
    matchAny(label, [
      /inconform/,
      /penal/,
      /descumpr/,
      /non.?compli/,
      /multa/,
    ])
  ) {
    return "fullNonCompliance";
  }

  if (
    matchAny(label, [
      /envio/,
      /envios/,
      /coleta/,
      /collect/,
      /retirada/,
      /withdraw/,
    ])
  ) {
    return "fullShipping";
  }

  // Label genérico ("Full", "Fulfillment") sem palavra-chave específica: não
  // presumir "envio" — deixar o chamador decidir pelo detail_sub_type /
  // fulfillment_info.type (mais confiável), em vez de arriscar classificar
  // errado uma cobrança de armazenagem/inconformidade como envio.
  return null;
}

export function subtractBillingCost(current: number, amount: number): number {
  return roundMoney(current - Math.abs(amount));
}

export function addBillingBonus(current: number, amount: number): number {
  return roundMoney(current + Math.abs(amount));
}

export function billingPeriodKey(year: number, month: number): string {
  const m = String(month).padStart(2, "0");
  return `${year}-${m}-01`;
}

export async function billingFetch<T>(
  url: string,
  accessToken: string,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return { ok: false, status: res.status, data: null };
  }

  return {
    ok: true,
    status: res.status,
    data: (await res.json()) as T,
  };
}

export function billingApiUrl(path: string): string {
  const { apiBase } = getMercadoLibreConfig();
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export type MlBillingLineCategory =
  | "saleFee"
  | "sellerShipping"
  | "fullShipping"
  | "fullStorage"
  | "fullNonCompliance"
  | "ads"
  | "minhaPagina"
  | "affiliateFee"
  | "cancelled"
  | "partialReturn"
  | "skip";

/** Classifica subtipo/label da API de faturamento MLB para linhas do DRE. */
export function classifyMlBillingEntry(
  subType: string,
  label: string,
  detailType: string,
): MlBillingLineCategory | "unmapped" {
  const type = subType.toUpperCase();
  const dt = detailType.toUpperCase();
  const isBonus = isBillingBonusType(dt);

  if (type === "PADS") return "ads";

  // Comissão de afiliados (CVAF) — antes do genérico CV*, senão cai em Tarifa ML.
  if (
    type === "CVAF" ||
    type === "BVAF" ||
    /afiliad/.test(label)
  ) {
    return "affiliateFee";
  }

  // Minha Página / eShop (CESM) — antes era skip.
  if (
    type === "CESM" ||
    type === "BESM" ||
    /minha pagina|manutencao.*(eshop|pagina)|tarifa de manutencao do eshop/.test(
      label,
    )
  ) {
    return "minhaPagina";
  }

  // Sub-tipo estruturado do ML é mais confiável que o texto do label —
  // checar primeiro para não deixar um label genérico de Full ("Full",
  // "Fulfillment") mascarar uma cobrança de armazenagem/inconformidade
  // cujo sub-tipo já identifica exatamente a categoria.
  if (type === "CFCBI" || type.startsWith("CFCB")) return "fullShipping";
  if (type === "CFWA" || type === "CFWARE") return "fullStorage";
  if (type === "CFPB") return "fullNonCompliance";

  const fullFromLabel = classifyFullChargeLabel(label);
  if (fullFromLabel === "fullShipping") return "fullShipping";
  if (fullFromLabel === "fullStorage") return "fullStorage";
  if (fullFromLabel === "fullNonCompliance") return "fullNonCompliance";

  // Label de Full sem palavra-chave específica e sem sub-tipo reconhecido:
  // assumir custo de envio (caso mais comum) em vez de deixar a cobrança
  // cair como "unmapped".
  if (isFullChargeLabel(label)) return "fullShipping";

  if (type === "CXC" || /cancel|cancelad|anulad/.test(label)) {
    return "cancelled";
  }

  if (
    type.startsWith("CV") ||
    type === "COM" ||
    (/tarifa de venda|cargo por venda|cargo por venta|comiss/.test(label) &&
      !isBonus)
  ) {
    return "saleFee";
  }

  if (
    type === "CFFE" ||
    type === "CFFI" ||
    type === "CXD" ||
    type === "SHP" ||
    /frete|envio|mercado env/.test(label)
  ) {
    return "sellerShipping";
  }

  if (
    isBonus &&
    (type.startsWith("BV") ||
      type.startsWith("BF") ||
      type === "BXD" ||
      /devol|reembol|parcial|bonific|bonus|credito|estorno/.test(label))
  ) {
    if (type === "BFFE" || /envio|frete/.test(label)) {
      return "sellerShipping";
    }
    // Bonificação de tarifa de venda (BXD/"bonificación del cargo por venta"
    // ou BV*) — não confundir com devolução parcial.
    if (
      (type.startsWith("BV") || type === "BXD") &&
      (type.includes("VML") ||
        type.includes("VPRC") ||
        type.includes("VFNU") ||
        type.includes("VFN") ||
        /tarifa|venda|venta|comiss|cargo por v/.test(label))
    ) {
      return "saleFee";
    }
    if (/devol|reembol|parcial|partial/.test(label)) {
      return "partialReturn";
    }
    // BXD/BV genérico sem label claro: não assumir devolução parcial.
    if (type === "BXD" || type.startsWith("BV") || type.startsWith("BF")) {
      return "unmapped";
    }
    return "partialReturn";
  }

  if (/devol|reembol|parcial|partial/.test(label)) {
    return "partialReturn";
  }

  if (type === "CFONPN" || type === "CCMP") {
    return "skip";
  }

  return "unmapped";
}

export function applyBillingLineAmount(
  category: MlBillingLineCategory,
  current: number,
  amount: number,
  isBonus: boolean,
): number {
  const abs = Math.abs(amount);
  if (category === "partialReturn") {
    return addBillingBonus(current, abs);
  }
  if (category === "saleFee" || category === "sellerShipping") {
    return isBonus
      ? addBillingBonus(current, abs)
      : subtractBillingCost(current, abs);
  }
  if (
    category === "fullShipping" ||
    category === "fullStorage" ||
    category === "fullNonCompliance" ||
    category === "cancelled" ||
    category === "ads" ||
    category === "minhaPagina" ||
    category === "affiliateFee"
  ) {
    return isBonus
      ? addBillingBonus(current, abs)
      : subtractBillingCost(current, abs);
  }
  return current;
}
