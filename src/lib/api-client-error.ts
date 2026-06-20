const API_ERROR_MESSAGES: Record<string, string> = {
  dre_load_failed: "Não foi possível carregar o DRE. Tente novamente.",
  dre_sync_failed: "Não foi possível sincronizar o mês com o Mercado Livre.",
  dre_cost_value_failed: "Não foi possível salvar o valor do custo fixo.",
  dre_cost_items_failed: "Não foi possível carregar os custos fixos.",
  dre_cost_item_create_failed: "Não foi possível criar o custo fixo.",
  dre_cost_item_update_failed: "Não foi possível atualizar o custo fixo.",
  dre_cost_item_delete_failed: "Não foi possível remover o custo fixo.",
  products_load_failed: "Não foi possível carregar os produtos.",
  product_create_failed: "Não foi possível criar o produto.",
  product_update_failed: "Não foi possível atualizar o produto.",
  product_delete_failed: "Não foi possível remover o produto.",
  full_shipments_load_failed: "Não foi possível carregar os envios Full.",
  full_shipment_create_failed: "Não foi possível registrar o envio Full.",
  full_shipment_update_failed: "Não foi possível atualizar o envio Full.",
  full_shipment_delete_failed: "Não foi possível excluir o envio Full.",
  full_shipments_import_failed: "Não foi possível importar coletas do faturamento ML.",
  full_shipment_save_failed: "Não foi possível salvar o envio Full.",
  products_suggestions_failed: "Não foi possível carregar sugestões de SKU.",
  tax_settings_load_failed: "Não foi possível carregar PIS/COFINS da empresa.",
  tax_settings_update_failed: "Não foi possível salvar PIS/COFINS da empresa.",
  Unauthorized: "Sessão expirada. Entre novamente.",
  "Invalid JSON": "Dados inválidos enviados ao servidor.",
};

export function formatApiErrorMessage(codeOrMessage: string): string {
  return API_ERROR_MESSAGES[codeOrMessage] ?? codeOrMessage;
}

export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string };
    if (json.error?.trim()) {
      return formatApiErrorMessage(json.error.trim());
    }
  } catch {
    /* body vazio ou não-JSON */
  }
  return formatApiErrorMessage(fallback);
}
