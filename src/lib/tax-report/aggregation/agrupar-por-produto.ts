import { agregarPorSku, aggregationKey } from "@/lib/tax-report/aggregation/agregador-por-sku";
import type { SkuAggregation } from "@/lib/tax-report/types";

/**
 * Relatório tributário por **produto**: as opções de venda (Clássico,
 * Premium… do mesmo produto físico) são somadas na linha do anúncio
 * principal. É reagrupar o que já está apurado (cada linha guarda as próprias
 * vendas), então os totais do mês não mudam e nada é reescrito no relatório
 * salvo — só a tela mostra uma linha por produto.
 */
export function agruparPorProduto(
  porSku: SkuAggregation[],
  principalOf: (mlItemId: string) => string,
): SkuAggregation[] {
  const hasOption = porSku.some(
    (row) => row.mlItemId !== undefined && principalOf(row.mlItemId) !== row.mlItemId,
  );
  if (!hasOption) return porSku;

  const transacoes = porSku.flatMap((row) => row.transacoes);
  // Snapshot sem transações por linha (formato antigo): não dá para reagrupar.
  if (transacoes.length === 0) return porSku;

  const grouped = agregarPorSku(transacoes, (det) =>
    det.transacao.itemId ? `item:${principalOf(det.transacao.itemId)}` : aggregationKey(det),
  );
  const aliasesByPrincipal = new Map<string, Set<string>>();
  for (const row of porSku) {
    if (!row.mlItemId) continue;
    const principal = principalOf(row.mlItemId);
    const set = aliasesByPrincipal.get(principal) ?? new Set<string>();
    for (const alias of row.skuAliases ?? []) set.add(alias);
    aliasesByPrincipal.set(principal, set);
  }

  return grouped.map((row) => {
    const first = row.transacoes[0]?.transacao.itemId;
    if (!first) return row;
    const principal = principalOf(first);
    const own = row.transacoes.find((det) => det.transacao.itemId === principal);
    const aliases = [...(aliasesByPrincipal.get(principal) ?? [])];
    return {
      ...row,
      mlItemId: principal,
      sku: own?.transacao.sku || row.sku,
      ...(aliases.length > 0 ? { skuAliases: aliases } : {}),
    };
  });
}

/** O mesmo, no relatório inteiro (só `porSku` muda). */
export function agruparRelatorioPorProduto<T extends { porSku: SkuAggregation[] }>(
  payload: T,
  principalOf: (mlItemId: string) => string,
): T {
  const porSku = agruparPorProduto(payload.porSku, principalOf);
  return porSku === payload.porSku ? payload : { ...payload, porSku };
}
