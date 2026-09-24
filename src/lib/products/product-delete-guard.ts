/**
 * Regras de bloqueio da remoção de um produto.
 *
 * Remover o cadastro não é operação neutra: as FKs que apontam para
 * `Product.mlItemId` reagem de formas diferentes e silenciosas.
 * - `KitItem` é `onDelete: Cascade` — o componente **some do kit**, e o custo
 *   calculado do kit cai sem nenhum aviso (margem parece melhor do que é).
 * - `DreProductCostLeveling` é `onDelete: SetNull` — o nivelamento sobrevive,
 *   mas perde a identidade e passa a depender do texto do SKU, além de sumir
 *   da tela de "Nivelar custos" (o seletor é montado a partir de Product).
 *
 * `active: false` já entrega o que o usuário quer em praticamente todo caso
 * ("não vendo mais isso"): tira das telas operacionais e preserva o histórico.
 * Então remover fica reservado ao cadastro recém-criado por engano — o único
 * caso em que apagar é mesmo o certo.
 */

export type ProductDeleteDependencies = {
  /** Quantidade no galpão (0 quando não há registro). */
  warehouseQuantity: number;
  /** Nivelamentos de custo do DRE vinculados por identidade. */
  levelingCount: number;
  /** Kits que usam este produto como componente. */
  kitCount: number;
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "a", "a e b", "a, b e c" */
function joinPtBr(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/**
 * Mensagem de bloqueio, ou `null` quando a remoção é permitida.
 * Sempre aponta a saída (desativar), e só sugere zerar o estoque quando o
 * estoque é o **único** impedimento — senão a dica seria falsa.
 */
export function productDeleteBlockedMessage(
  deps: ProductDeleteDependencies,
): string | null {
  const blockers: string[] = [];
  if (deps.warehouseQuantity > 0) {
    blockers.push(plural(deps.warehouseQuantity, "unidade", "unidades") + " no galpão");
  }
  if (deps.levelingCount > 0) {
    blockers.push(
      plural(deps.levelingCount, "nivelamento", "nivelamentos") + " de custo no DRE",
    );
  }
  if (deps.kitCount > 0) {
    blockers.push(
      `participação em ${plural(deps.kitCount, "kit", "kits")}`,
    );
  }
  if (blockers.length === 0) return null;

  const onlyStock = blockers.length === 1 && deps.warehouseQuantity > 0;
  const remedy = onlyStock
    ? "Zere o estoque em Estoque antes de remover o cadastro, ou apenas desative o produto."
    : "Desative o produto em vez de remover — ele sai das telas do dia a dia e o histórico (DRE, kits e relatórios) continua correto.";

  return `Não dá para remover este produto: ${joinPtBr(blockers)}. ${remedy}`;
}
