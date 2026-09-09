/**
 * Formatação de moeda BRL — ponto único; antes cada domínio (Estoque,
 * Lucratividade, Concorrência de catálogo, períodos de receita) reimplementava
 * o mesmo `toLocaleString("pt-BR", { style: "currency", currency: "BRL" })`
 * separadamente. Os nomes antigos continuam existindo em cada módulo (agora
 * como alias/wrapper fino daqui) — nenhum call site precisou mudar.
 */
export function formatMoneyBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Mesma formatação, com `null` virando "—" (o caso mais comum em UI). */
export function formatMoneyBRLOrDash(value: number | null): string {
  if (value === null) return "—";
  return formatMoneyBRL(value);
}
