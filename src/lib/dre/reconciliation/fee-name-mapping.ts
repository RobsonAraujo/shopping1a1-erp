import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeFeeName(name: string): string {
  return stripAccents(name).toLowerCase().replace(/\s+/g, " ").trim();
}

const FEE_NAME_TO_LINE: Record<string, DreEditableLineKey> = {
  "custo por vender no mercado livre": "saleFeeMl",
  "custo por cobrar no mercado pago": "saleFeeMl",
  "taxa de recebimento": "saleFeeMl",
  "tarifa de venda": "saleFeeMl",
  "tarifa pelo servico de armazenamento full": "fullStorageMl",
  "tarifa por estoque antigo no full": "fullStorageMl",
  "custo por inconformidade no envios full": "fullNonComplianceMl",
  "tarifa de manutencao da minha pagina": "minhaPaginaMl",
  "cargo por venta con afiliados": "affiliateFeeMl",
  "tarifa de envio extra ou intermunicipal": "sellerShippingMl",
  "tarifa por envio interno ao municipio": "sellerShippingMl",
  "tarifa de envio": "sellerShippingMl",
  "tarifa de devolucao": "returnFeeMl",
  "tarifa de devolucao por envio externo ou intermunicipal": "returnFeeMl",
};

export const FEE_NAME_FALLBACK_LINE: DreEditableLineKey = "specialFeesMl";

function isSkippedReconciliationFee(normalized: string): boolean {
  return (
    normalized.includes("product ads") ||
    normalized.includes("mclicks") ||
    normalized.includes("taxa de parcelamento")
  );
}

function cancellationBaseName(normalized: string): string | null {
  const match = normalized.match(/^cancelamento(?: da| do| de)? (.+)$/);
  return match?.[1] ?? null;
}

export function resolveFeeLineKey(name: string): {
  lineKey: DreEditableLineKey | null;
  recognized: boolean;
  skipped: boolean;
  credit: boolean;
} {
  const normalized = normalizeFeeName(name);
  if (!normalized) {
    return {
      lineKey: FEE_NAME_FALLBACK_LINE,
      recognized: false,
      skipped: false,
      credit: false,
    };
  }

  const baseName = cancellationBaseName(normalized);
  const lookup = baseName ?? normalized;
  const credit = baseName !== null;

  if (isSkippedReconciliationFee(lookup) || isSkippedReconciliationFee(normalized)) {
    return { lineKey: null, recognized: true, skipped: true, credit };
  }

  const exact = FEE_NAME_TO_LINE[lookup];
  if (exact) {
    return { lineKey: exact, recognized: true, skipped: false, credit };
  }

  return {
    lineKey: FEE_NAME_FALLBACK_LINE,
    recognized: false,
    skipped: false,
    credit,
  };
}
