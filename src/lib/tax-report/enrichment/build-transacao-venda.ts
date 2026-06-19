import type { OrderSearchOrder } from "@/lib/mercadolibre/types";
import type { OrderBillingInfoResponse } from "@/lib/tax-report/ml/billing-info-client";
import {
  parseBuyerDocumentType,
  parseTaxpayerTypeFromMl,
  parseUfFromBilling,
} from "@/lib/tax-report/ml/billing-info-client";
import { resolveUfDestino } from "@/lib/tax-report/brazilian-ufs";
import {
  itemIdFromOrderLine,
  revenueFromOrderItemLine,
  skuFromOrderLineWithFallback,
} from "@/lib/tax-report/ml/sku-from-order-line";
import type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
import type {
  ManualFiscalOverride,
  TransacaoVenda,
} from "@/lib/tax-report/types";
import type { ItemBody } from "@/lib/mercadolibre/types";

export function buildTransacoesFromOrder(input: {
  order: OrderSearchOrder;
  billing: OrderBillingInfoResponse | null;
  itemById: Map<string, ItemBody>;
  custoBySku: Map<string, CustoProduto>;
  contributorByCnpj: Map<string, boolean>;
  overrides?: Record<string, ManualFiscalOverride>;
}): TransacaoVenda[] {
  const orderId = String(input.order.id ?? "");
  const orderDate =
    input.order.date_closed ?? input.order.date_created ?? new Date().toISOString();

  const billingAvailable = input.billing != null;
  const docType = parseBuyerDocumentType(
    input.billing?.buyer?.billing_info?.identification?.type,
  );
  const documento =
    input.billing?.buyer?.billing_info?.identification?.number ?? null;
  const mlTaxpayer = parseTaxpayerTypeFromMl(
    input.billing?.buyer?.billing_info?.taxes?.taxpayer_type?.description,
  );
  const ufFromBilling = parseUfFromBilling(input.billing);

  const transacoes: TransacaoVenda[] = [];

  for (const line of input.order.order_items ?? []) {
    const itemId = itemIdFromOrderLine(line) ?? "";
    const sku =
      skuFromOrderLineWithFallback(line, input.itemById) ?? "(sem SKU)";
    const transactionKey = `${orderId}-${itemId}-${sku}`;
    const override = input.overrides?.[transactionKey];

    const custo = input.custoBySku.get(sku);
    const quantidade =
      typeof line.quantity === "number" && line.quantity > 0 ? line.quantity : 1;

    let contribuinteIcms: boolean | null = mlTaxpayer;
    let contribuinteSource: TransacaoVenda["contribuinteSource"] =
      mlTaxpayer !== null ? "ml_taxpayer_type" : null;

    if (override) {
      contribuinteIcms = override.contribuinteIcms;
      contribuinteSource = "manual_override";
    } else if (
      contribuinteIcms === null &&
      docType === "CNPJ" &&
      documento
    ) {
      const cached = input.contributorByCnpj.get(documento.replace(/\D/g, ""));
      if (cached !== undefined) {
        contribuinteIcms = cached;
        contribuinteSource = "ml_taxpayer_type";
      }
    }

    const dadosFiscaisIndisponiveis = !billingAvailable && !override;

    transacoes.push({
      transactionKey,
      orderId,
      orderDate,
      sku,
      itemId,
      quantidade,
      receitaBruta: revenueFromOrderItemLine(line),
      ufDestino: resolveUfDestino(override?.ufDestino ?? ufFromBilling),
      tipoDocumento: override?.tipoDocumento ?? docType,
      documento,
      contribuinteIcms,
      contribuinteSource,
      dadosFiscaisIndisponiveis,
      custoAquisicaoUnitario: custo?.pricingCost ?? null,
      extraCostsUnitario: custo?.extraCosts ?? 0,
      mercadoriaImportada: custo?.isImported ?? false,
      conteudoImportacaoPercentual: custo?.importContentPercent ?? 0,
      isMonophasic: custo?.isMonophasic ?? false,
    });
  }

  return transacoes;
}
