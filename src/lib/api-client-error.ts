const API_ERROR_MESSAGES: Record<string, string> = {
  dre_load_failed: "Não foi possível carregar o DRE. Tente novamente.",
  dre_sync_failed: "Não foi possível sincronizar o mês com o Mercado Livre.",
  dre_cost_value_failed: "Não foi possível salvar o valor do custo fixo.",
  dre_cost_items_failed: "Não foi possível carregar os custos fixos.",
  dre_cost_item_create_failed: "Não foi possível criar o custo fixo.",
  dre_cost_item_update_failed: "Não foi possível atualizar o custo fixo.",
  dre_cost_item_delete_failed: "Não foi possível remover o custo fixo.",
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
