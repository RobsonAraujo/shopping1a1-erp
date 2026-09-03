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
import { normalizeProductSku } from "@/lib/product-pricing";
import { roundMoney } from "@/lib/financial-margin";
import type { CustoLookup } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import type {
  ManualFiscalOverride,
  TransacaoVenda,
} from "@/lib/tax-report/types";
import type { ItemBody } from "@/lib/mercadolibre/types";

export function buildTransacoesFromOrder(input: {
  order: OrderSearchOrder;
  billing: OrderBillingInfoResponse | null;
  itemById: Map<string, ItemBody>;
  /** Preferir `byMlItemId` — `bySku` é só fallback pra linha sem itemId resolvido (`Product.sku` não é mais único). */
  custoLookup: CustoLookup;
  contributorByCnpj: Map<string, boolean>;
  overrides?: Record<string, ManualFiscalOverride>;
  /** Custo total de frete pago pela empresa por pedido (chave = orderId) — rateado por linha proporcionalmente à receita. */
  freightCostByOrderId?: Map<string, number>;
  /**
   * SKU efetivo por `mlItemId` (`resolveEffectiveSkuByItemId`) — quando o
   * anúncio está vinculado a um Product, prevalece sobre o texto de SKU da
   * linha do pedido (que pode ser um snapshot antigo, capturado quando a
   * venda foi feita, e já não bater com o SKU cadastrado hoje). Sem entrada
   * pro item, cai no texto da linha como antes desta migração.
   */
  effectiveSkuByItemId?: Map<string, string | null>;
}): TransacaoVenda[] {
  const orderId = String(input.order.id ?? "");
  const orderDate =
    input.order.date_closed ?? input.order.date_created ?? new Date().toISOString();

  const freightCostPedido = input.freightCostByOrderId?.get(orderId) ?? 0;
  const receitaTotalPedido = (input.order.order_items ?? []).reduce(
    (sum, line) => sum + revenueFromOrderItemLine(line),
    0,
  );

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
    const effectiveSku = itemId
      ? input.effectiveSkuByItemId?.get(itemId)
      : undefined;
    const sku =
      effectiveSku ??
      skuFromOrderLineWithFallback(line, input.itemById) ??
      "(sem SKU)";
    const transactionKey = `${orderId}-${itemId}-${sku}`;
    const override = input.overrides?.[transactionKey];

    const custo =
      (itemId ? input.custoLookup.byMlItemId.get(itemId) : undefined) ??
      input.custoLookup.bySku.get(normalizeProductSku(sku));
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

    const receitaLinha = revenueFromOrderItemLine(line);
    const freightCost =
      freightCostPedido > 0 && receitaTotalPedido > 0
        ? roundMoney((receitaLinha / receitaTotalPedido) * freightCostPedido)
        : 0;

    transacoes.push({
      transactionKey,
      orderId,
      orderDate,
      sku,
      itemId,
      quantidade,
      receitaBruta: receitaLinha,
      ufDestino: resolveUfDestino(override?.ufDestino ?? ufFromBilling),
      tipoDocumento: override?.tipoDocumento ?? docType,
      documento,
      contribuinteIcms,
      contribuinteSource,
      dadosFiscaisIndisponiveis,
      custoAquisicaoUnitario: custo?.pricingCost ?? null,
      unitCostNf: custo?.unitCostNf ?? null,
      purchaseIcmsPercent: custo?.purchaseIcmsPercent ?? 0,
      hasIcmsSt: custo?.hasIcmsSt ?? false,
      purchaseCostWithSt: custo?.purchaseCostWithSt ?? null,
      saleIcmsPercent: custo?.saleIcmsPercent ?? 0,
      extraCostsUnitario: custo?.extraCosts ?? 0,
      mercadoriaImportada: custo?.isImported ?? false,
      isMonophasic: custo?.isMonophasic ?? false,
      saleFee:
        typeof line.sale_fee === "number" && Number.isFinite(line.sale_fee)
          ? line.sale_fee
          : 0,
      freightCost,
      ipiPercent: custo?.ipiPercent ?? 0,
    });
  }

  return transacoes;
}
