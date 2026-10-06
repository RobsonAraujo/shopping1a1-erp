import { formatDreMonthLabel } from "@/lib/mercadolibre/revenue-periods";

/**
 * Rótulo de uma **lista de meses** do DRE, em pt-BR.
 *
 * Existe porque contagem sem mês deixa o usuário perdido: «5 conciliações de DRE
 * pendentes» não diz onde agir. A Home usa isto em duas superfícies — o pill da
 * zona de atenção (cortado) e o card de pendências (completo) —, então a
 * formatação tem que ser uma só, pura e testável.
 *
 * Mora em `src/lib/dre/` e não em `revenue-periods.ts` (aquele módulo é sobre
 * períodos de faturamento do ML) nem em `home-attention.ts` (a tela do DRE também
 * consome: um módulo de Home seria dependência na direção errada).
 */

export type DreMonthRef = { year: number; month: number };

/** Quantos meses saem por extenso antes de virar "+N". 3 cabe no pill de uma
 * linha; acima disso o texto empurra os outros pills pra outra fileira. */
export const DRE_MONTH_LIST_SHORT_MAX = 3;

export type DreMonthListText = {
  /** Cortado em `max`: `"dez./2025, jan., fev. e +4"`. Para o pill. */
  short: string;
  /** Tudo. Para o card e para o `title`/`aria-label` do pill. */
  full: string;
  /** Quantos ficaram fora do `short`; 0 quando nada foi cortado. */
  overflow: number;
};

function sortedUnique(months: readonly DreMonthRef[]): DreMonthRef[] {
  const byKey = new Map<string, DreMonthRef>();
  for (const ref of months) {
    // Deduplica mesmo com a invariante do banco garantindo 1 pendente por mês
    // (`createPendingReconciliationImport` apaga o anterior): a função é
    // compartilhada e não pode produzir "fev. e fev." se um caller novo repetir.
    byKey.set(`${ref.year}-${ref.month}`, ref);
  }
  // Ordena aqui, **sem confiar na ordem do caller** — hoje o `orderBy` existe no
  // loader, amanhã pode vir de outro lugar. Crescente porque o pendente mais
  // antigo é o que travou o mês fechado, e porque `dreMonths` já vem crescente:
  // duas listas na mesma zona com ordens opostas seria pior que nenhuma ordem.
  return [...byKey.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );
}

/**
 * Junção pt-BR, na mão. `Intl.ListFormat` daria o mesmo resultado, mas depende do
 * ICU completo da imagem de CI, e o projeto já escreve pt-BR à mão
 * (`MONTH_SHORT_PT`, `plural`).
 */
function join(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function label(ref: DreMonthRef, currentYear: number): string {
  const month = formatDreMonthLabel(ref.month);
  // O ano só aparece quando difere do corrente — senão o rótulo fica poluído.
  // Mas quando difere ele é **obrigatório**: a leitura de pendências não filtra
  // por ano, então "dez." sozinho leria como dezembro deste ano. A barra copia o
  // padrão que o relatório tributário já usa ("Março/2026").
  return ref.year === currentYear ? month : `${month}/${ref.year}`;
}

/**
 * **Nunca acrescenta ponto final.** Os rótulos de mês já terminam em ponto
 * (`"fev."`), então um caller que concatene `"."` produz `"fev.."`.
 */
export function formatDreMonthList(
  months: readonly DreMonthRef[],
  options: { currentYear: number; max?: number },
): DreMonthListText {
  const max = options.max ?? DRE_MONTH_LIST_SHORT_MAX;
  const labels = sortedUnique(months).map((ref) => label(ref, options.currentYear));

  if (labels.length === 0) return { short: "", full: "", overflow: 0 };

  const full = join(labels);
  const overflow = Math.max(0, labels.length - max);

  return {
    short: overflow === 0 ? full : join([...labels.slice(0, max), `+${overflow}`]),
    full,
    overflow,
  };
}

/**
 * O único ano da lista, quando ele **não** é o corrente — serve pra quem monta um
 * link saber se vale apontar pra outro ano.
 *
 * Devolve `null` quando há mistura de anos (aí o ano corrente é o melhor destino,
 * porque é onde está a maioria) ou quando tudo é do ano corrente. Este módulo não
 * conhece rotas de propósito: quem chama decide o que fazer com o número.
 */
export function singleForeignYear(
  months: readonly DreMonthRef[],
  currentYear: number,
): number | null {
  const years = new Set(months.map((ref) => ref.year));
  if (years.size !== 1) return null;
  const [only] = [...years];
  return only === currentYear ? null : only;
}
