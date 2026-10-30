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
  // Nome do estorno ("Cancelamento da tarifa por inconformidade no Envios Full").
  "tarifa por inconformidade no envios full": "fullNonComplianceMl",
  // Full envios vem do Relatório Full (linha fora da planilha); mapear aqui só
  // impede a coleta de cair em outra linha e ser contada duas vezes.
  "custo do servico de coleta full": "fullShippingMl",
  "tarifa de manutencao da minha pagina": "minhaPaginaMl",
  "cargo por venta con afiliados": "affiliateFeeMl",
  "tarifa de envio extra ou intermunicipal": "sellerShippingMl",
  "tarifa por envio interno ao municipio": "sellerShippingMl",
  "tarifa de envio": "sellerShippingMl",
  "tarifa de devolucao": "returnFeeMl",
  "tarifa de devolucao por envio externo ou intermunicipal": "returnFeeMl",
  "tarifa de devolucao por envio interno no municipio": "returnFeeMl",
  // Nome do estorno ("Cancelamento da tarifa por devolução").
  "tarifa por devolucao": "returnFeeMl",
};

/**
 * - `line`: vai para `lineKey`.
 * - `skipped`: repasse ou linha de outra fonte (Product Ads, parcelamento pago
 *   pelo comprador) — fica fora sem aviso.
 * - `difal`: ICMS-DIFAL recolhido pelo ML; a linha depende do regime
 *   (`mlDifalCountsAsFee`).
 * - `non_operational`: despesa financeira (juros de empréstimo) — fica fora e
 *   aparece na prévia para o usuário decidir onde lançar.
 * - `unrecognized`: nome que o DRE não conhece — fica fora e aparece na prévia.
 */
export type FeeResolution = {
  kind: "line" | "skipped" | "difal" | "non_operational" | "unrecognized";
  lineKey: DreEditableLineKey | null;
  /** Estorno ("Cancelamento da/do …"): entra com sinal positivo. */
  credit: boolean;
};

function isSkippedReconciliationFee(normalized: string): boolean {
  return (
    normalized.includes("product ads") ||
    normalized.includes("mclicks") ||
    normalized.includes("taxa de parcelamento")
  );
}

function isDifalFee(normalized: string): boolean {
  return /difal|diferencial de aliquota/.test(normalized);
}

function isNonOperationalFee(normalized: string): boolean {
  return /emprestimo/.test(normalized);
}

function cancellationBaseName(normalized: string): string | null {
  const match = normalized.match(/^cancelamento(?: da| do| de)? (.+)$/);
  return match?.[1] ?? null;
}

export function resolveFeeLineKey(name: string): FeeResolution {
  const normalized = normalizeFeeName(name);
  if (!normalized) {
    return { kind: "unrecognized", lineKey: null, credit: false };
  }

  const baseName = cancellationBaseName(normalized);
  const lookup = baseName ?? normalized;
  const credit = baseName !== null;

  if (isSkippedReconciliationFee(lookup) || isSkippedReconciliationFee(normalized)) {
    return { kind: "skipped", lineKey: null, credit };
  }

  const exact = FEE_NAME_TO_LINE[lookup];
  if (exact) {
    return { kind: "line", lineKey: exact, credit };
  }
  if (isDifalFee(lookup)) {
    return { kind: "difal", lineKey: null, credit };
  }
  if (isNonOperationalFee(lookup)) {
    return { kind: "non_operational", lineKey: null, credit };
  }
  return { kind: "unrecognized", lineKey: null, credit };
}
