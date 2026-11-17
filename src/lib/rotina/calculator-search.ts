/**
 * Busca da Calculadora: por palavras em qualquer ordem, sem acento e sem caixa
 * ("kit parafuso" acha "Parafuso Sextavado Kit 50"). O MLB entra de qualquer
 * jeito (`MLB123`, `mlb-123`, `123`), e SKU ou MLB exato sobe para o topo —
 * quem cola o código quer aquele anúncio, não os parecidos. Puro.
 */

export type CalculatorSearchFields = {
  mlItemId: string;
  title: string;
  sku: string | null;
};

export type CalculatorSearchEntry<T> = {
  item: T;
  /** Título, SKU e MLB já dobrados, num texto só. */
  key: string;
  sku: string | null;
  mlItemId: string;
  idDigits: string;
};

/** Sem acento, minúsculo, espaços simples. */
export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "mlb-123" / "MLB 123" → "mlb123" (o resto fica como está). */
function normalizeIdText(value: string): string {
  return value.replace(/\bmlb[-\s]+(\d)/g, "mlb$1");
}

function digitsOf(mlItemId: string): string {
  return mlItemId.replace(/\D/g, "");
}

/** Monta o índice uma vez (a lista não muda enquanto a página está aberta). */
export function buildCalculatorSearchIndex<T>(
  items: readonly T[],
  fields: (item: T) => CalculatorSearchFields,
): CalculatorSearchEntry<T>[] {
  return items.map((item) => {
    const { mlItemId, title, sku } = fields(item);
    const foldedSku = sku ? foldSearchText(sku) : null;
    const foldedId = foldSearchText(mlItemId);
    return {
      item,
      key: [foldSearchText(title), foldedSku ?? "", foldedId].join(" "),
      sku: foldedSku,
      mlItemId: foldedId,
      idDigits: digitsOf(mlItemId),
    };
  });
}

/** O código exato: SKU igual, MLB igual (com ou sem "MLB"/hífen). */
function isExact<T>(entry: CalculatorSearchEntry<T>, query: string): boolean {
  if (entry.sku !== null && entry.sku === query) return true;
  if (entry.mlItemId === query) return true;
  return /^\d+$/.test(query) && entry.idDigits === query;
}

/**
 * Filtra mantendo a ordem do índice (impacto, na Calculadora), com os
 * exatos na frente. Consulta vazia devolve tudo.
 */
export function searchCalculatorIndex<T>(
  index: readonly CalculatorSearchEntry<T>[],
  rawQuery: string,
): T[] {
  const query = normalizeIdText(foldSearchText(rawQuery));
  if (!query) return index.map((entry) => entry.item);
  const tokens = query.split(" ");
  const exact: T[] = [];
  const rest: T[] = [];
  for (const entry of index) {
    if (isExact(entry, query)) {
      exact.push(entry.item);
    } else if (tokens.every((token) => entry.key.includes(token))) {
      rest.push(entry.item);
    }
  }
  return [...exact, ...rest];
}
