export const GENERIC_USER_ERROR =
  "Não foi possível concluir esta ação. Tente novamente em instantes.";

export const RATE_LIMIT_USER_ERROR =
  "O Mercado Livre está ocupado no momento. Aguarde um pouco e tente de novo.";

export const NETWORK_USER_ERROR =
  "Sem conexão no momento. Confira a internet e tente novamente.";

export const INVALID_DATE_RANGE_USER_ERROR =
  "Escolha um período válido: a data inicial precisa ser anterior ou igual à final, com no máximo 90 dias.";

const API_ERROR_MESSAGES: Record<string, string> = {
  dre_load_failed: "Não foi possível carregar o DRE. Tente novamente.",
  dre_sync_failed: "Não foi possível sincronizar o mês com o Mercado Livre.",
  dre_cost_value_failed: "Não foi possível salvar o valor do custo fixo.",
  dre_cost_items_failed: "Não foi possível carregar os custos fixos.",
  dre_cost_item_create_failed: "Não foi possível criar o custo fixo.",
  dre_cost_item_update_failed: "Não foi possível atualizar o custo fixo.",
  dre_cost_item_delete_failed: "Não foi possível remover o custo fixo.",
  dre_product_cost_leveling_failed:
    "Não foi possível carregar os nivelamentos de custo.",
  dre_product_cost_leveling_save_failed:
    "Não foi possível salvar o nivelamento de custo.",
  dre_product_cost_leveling_create_failed:
    "Não foi possível salvar o nivelamento de custo.",
  dre_product_cost_leveling_update_failed:
    "Não foi possível salvar o nivelamento de custo.",
  dre_product_cost_leveling_delete_failed:
    "Não foi possível excluir o nivelamento de custo.",
  dre_line_patch_failed: "Não foi possível atualizar esta linha do DRE.",
  products_load_failed: "Não foi possível carregar os produtos.",
  product_load_failed: "Não foi possível carregar o produto.",
  product_create_failed: "Não foi possível criar o produto.",
  product_update_failed: "Não foi possível atualizar o produto.",
  product_delete_failed: "Não foi possível remover o produto.",
  product_aliases_load_failed: "Não foi possível carregar os SKUs alias.",
  product_alias_create_failed: "Não foi possível adicionar o SKU alias.",
  product_alias_delete_failed: "Não foi possível remover o SKU alias.",
  full_shipments_load_failed: "Não foi possível carregar os envios Full.",
  full_shipment_create_failed: "Não foi possível registrar o envio Full.",
  full_shipment_update_failed: "Não foi possível atualizar o envio Full.",
  full_shipment_delete_failed: "Não foi possível excluir o envio Full.",
  full_shipments_import_failed:
    "Não foi possível importar coletas do faturamento ML.",
  full_shipment_save_failed: "Não foi possível salvar o envio Full.",
  products_suggestions_failed: "Não foi possível carregar sugestões de SKU.",
  tax_settings_load_failed: "Não foi possível carregar as configurações fiscais.",
  tax_settings_update_failed: "Não foi possível salvar as configurações fiscais.",
  tax_config_load_failed: "Não foi possível carregar a configuração tributária.",
  tax_config_save_failed: "Não foi possível salvar a configuração tributária.",
  tax_fixed_cost_items_failed: "Não foi possível carregar os custos fixos fiscais.",
  tax_fixed_cost_item_create_failed: "Não foi possível criar o custo fixo.",
  tax_fixed_cost_item_update_failed: "Não foi possível atualizar o custo fixo.",
  tax_fixed_cost_item_delete_failed: "Não foi possível remover o custo fixo.",
  tax_fixed_cost_item_end_failed: "Não foi possível encerrar o custo fixo.",
  tax_fixed_cost_month_exclude_failed:
    "Não foi possível excluir o custo neste mês.",
  tax_fixed_cost_value_failed: "Não foi possível salvar o valor do custo fixo.",
  revenue_simulations_list_failed: "Não foi possível carregar as simulações salvas.",
  revenue_simulation_create_failed: "Não foi possível salvar a simulação.",
  revenue_simulation_get_failed: "Não foi possível abrir a simulação.",
  revenue_simulation_update_failed:
    "Não foi possível salvar as alterações da simulação.",
  revenue_simulation_delete_failed: "Não foi possível excluir a simulação.",
  period_tax_load_failed: "Não foi possível carregar o relatório deste período.",
  invalid_date_range: INVALID_DATE_RANGE_USER_ERROR,
  monthly_tax_load_failed: "Não foi possível carregar o relatório tributário.",
  monthly_tax_generate_failed: "Não foi possível gerar o relatório tributário.",
  catalog_report_failed: "Não foi possível carregar o relatório de catálogo.",
  catalog_item_report_failed: "Não foi possível carregar o detalhe do anúncio.",
  catalog_snapshot_failed: "Não foi possível atualizar o snapshot de catálogo.",
  replenishment_board_failed: "Não foi possível carregar o quadro de reposição.",
  replenishment_sync_failed: "Não foi possível sincronizar o quadro de reposição.",
  replenishment_patch_failed: "Não foi possível atualizar o card de reposição.",
  kits_load_failed: "Não foi possível carregar os kits.",
  kit_create_failed: "Não foi possível criar o kit.",
  kit_update_failed: "Não foi possível atualizar o kit.",
  kit_delete_failed: "Não foi possível excluir o kit.",
  kit_candidates_load_failed: "Não foi possível carregar candidatos de kit.",
  inventory_get_failed: "Não foi possível carregar o estoque deste anúncio.",
  inventory_patch_failed: "Não foi possível atualizar o estoque.",
  stock_report_sales_adjustment_failed:
    "Não foi possível calcular o ajuste de vendas.",
  stock_attention_ack_failed: "Não foi possível marcar o alerta como visto.",
  items_failed: "Não foi possível carregar os anúncios.",
  item_failed: "Não foi possível carregar o anúncio.",
  financial_evaluation_failed: "Não foi possível carregar a lucratividade.",
  min_prices_failed: "Não foi possível calcular os preços mínimos.",
  wholesale_settings_update_failed:
    "Não foi possível salvar as configurações de atacado.",
  wholesale_apply_failed: "Não foi possível aplicar os preços de atacado.",
  promotion_summary_failed: "Não foi possível carregar o resumo de promoções.",
  supplier_revenue_failed: "Não foi possível carregar a receita do fornecedor.",
  request_failed: GENERIC_USER_ERROR,
  stream_failed: "A atualização em tempo real foi interrompida. Tente de novo.",
  update_failed: GENERIC_USER_ERROR,
  unauthenticated: "Sessão expirada. Entre novamente.",
  no_organization: "Não encontramos sua empresa nesta conta. Entre novamente.",
  blocked: "Esta conta está pausada. Fale com o suporte para reativar.",
  organization_blocked: "Esta conta está pausada. Fale com o suporte para reativar.",
  Unauthorized: "Sessão expirada. Entre novamente.",
  "Invalid JSON": "Os dados enviados não puderam ser lidos. Tente novamente.",
  "Not found": "Não encontramos o que você pediu.",
  Forbidden: "Você não tem permissão para esta ação.",
  invalid_json: "Os dados enviados não puderam ser lidos. Tente novamente.",
  invalid_range: INVALID_DATE_RANGE_USER_ERROR,
  invalid_period: INVALID_DATE_RANGE_USER_ERROR,
};

export function logClientError(context: string, error: unknown): void {
  console.error(`[user-feedback:${context}]`, error);
}

function looksTechnical(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (
    /failed to fetch|networkerror|load failed|fetch failed|typeerror|aborterror/.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /rate.?limit|too many requests|\b429\b|quota exceeded|retry.?after/.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /yyyy-mm-dd|from e to|query param|status code|econnreset|etimedout|prisma|sqlstate|stack trace|\bmust be\b|\bis required\b|\bnot found\b|\bforbidden\b/.test(
      lower,
    )
  ) {
    return true;
  }
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(trimmed)) return true;
  if (/^[A-Z][A-Za-z]+Error:/.test(trimmed)) return true;
  if (/\.ts:\d+|\.js:\d+| at \w+ \(/.test(trimmed)) return true;
  return false;
}

function classifyTechnical(message: string): string {
  const lower = message.toLowerCase();
  if (
    /failed to fetch|networkerror|load failed|fetch failed|econnreset|etimedout/.test(
      lower,
    )
  ) {
    return NETWORK_USER_ERROR;
  }
  if (
    /rate.?limit|too many requests|\b429\b|quota exceeded/.test(lower)
  ) {
    return RATE_LIMIT_USER_ERROR;
  }
  if (/yyyy-mm-dd|from e to|invalid_date_range|invalid_range/.test(lower)) {
    return INVALID_DATE_RANGE_USER_ERROR;
  }
  return GENERIC_USER_ERROR;
}

export function formatApiErrorMessage(codeOrMessage: string): string {
  const mapped = API_ERROR_MESSAGES[codeOrMessage];
  if (mapped) return mapped;
  if (looksTechnical(codeOrMessage)) {
    logClientError("unmapped_api_error", codeOrMessage);
    return classifyTechnical(codeOrMessage);
  }
  return codeOrMessage;
}

export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string; message?: string };
    if (json.message?.trim()) {
      return formatApiErrorMessage(json.message.trim());
    }
    if (json.error?.trim()) {
      return formatApiErrorMessage(json.error.trim());
    }
  } catch {
    /* body vazio ou não-JSON */
  }
  return formatApiErrorMessage(fallback);
}
