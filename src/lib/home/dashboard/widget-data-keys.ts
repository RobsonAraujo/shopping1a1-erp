/**
 * Contrato de dados dos widgets de batch — puro de propósito: é importado
 * pelo registry (que precisa ser carregável em componente client) e pelo
 * loader de servidor. Nada aqui pode importar `prisma` nem componente.
 *
 * Cada chave é resolvida por UM loader no servidor e pode alimentar vários
 * widgets. A grade pede a união das chaves dos widgets visíveis num único
 * request — daí a invariante que governa esta lista:
 *
 * > Loader que possa passar de ~1,5s, ou que faça chamada ao Mercado Livre,
 * > NÃO pode ser chave de batch (a chave mais lenta travaria as outras).
 * > Vai como widget `{ kind: "isolated" }`, com rota própria.
 *
 * Por isso RBT12/Simples Nacional está fora: `loadRbt12` chama o ML no cache
 * miss mesmo com `forceRefresh = false`.
 */

/**
 * Hoje só `finance`. A máquina de união/dedup de chaves continua genérica de
 * propósito: é o ponto de extensão do próximo widget de dado pesado
 * (registrar a chave, o tipo da slice, o resolver e o widget — nada mais).
 *
 * Enquanto existe uma chave só, os testes de "dois widgets de chaves
 * diferentes → um request" ficam sem sujeito; eles voltam junto com a segunda
 * chave. O que continua coberto é o que já quebrou de verdade: laço de
 * request, não re-buscar ao personalizar e não buscar widget escondido.
 */
export const HOME_WIDGET_DATA_KEYS = ["finance"] as const;

export type HomeWidgetDataKey = (typeof HOME_WIDGET_DATA_KEYS)[number];

/** Resultado do DRE do ano, já estreitado — nunca trafegar `DreYearView`
 * inteiro (12 meses × ~20 arrays de breakdown = payload de megabytes). */
export type HomeFinanceSlice = {
  year: number;
  latestMonth: number | null;
  latestMonthLabel: string | null;
  latestSyncedAt: string | null;
  totalEntrada: number | null;
  margemContribuicao: number | null;
  margemContribuicaoPercent: number | null;
  lucroOperacional: number | null;
  lucroOperacionalPercent: number | null;
  resultadoLiquido: number | null;
  /** 12 posições (jan→dez); `null` em mês sem snapshot. */
  resultadoLiquidoSeries: (number | null)[];
  margemPercentSeries: (number | null)[];
  monthsSyncedCount: number;
  syncWarningCount: number;
};

export type HomeWidgetDataPayloads = {
  finance: HomeFinanceSlice;
};

/** União discriminada: uma slice que falhou não pode ser confundida com uma
 * slice cujo payload por acaso tenha um campo `error`. */
export type HomeWidgetDataResult<K extends HomeWidgetDataKey> =
  | { ok: true; value: HomeWidgetDataPayloads[K] }
  | { ok: false; error: string };

export type HomeWidgetDataSlices = Partial<{
  [K in HomeWidgetDataKey]: HomeWidgetDataResult<K>;
}>;

export type HomeWidgetDataResponse = {
  resolvedAt: string;
  data: HomeWidgetDataSlices;
};

function isHomeWidgetDataKey(value: string): value is HomeWidgetDataKey {
  // Pertencimento à allowlist, nunca índice de objeto: `resolvers[key]` seria
  // alcançável por "__proto__"/"constructor" vindos da query string.
  return (HOME_WIDGET_DATA_KEYS as readonly string[]).includes(value);
}

/**
 * Lê o parâmetro `keys` da query. Descarta desconhecidos, deduplica e
 * devolve em ordem estável (a mesma de `HOME_WIDGET_DATA_KEYS`) — a ordem
 * estável é o que permite usar a lista de chaves como dependência de effect
 * no client sem re-disparar a cada render.
 */
export function parseHomeWidgetDataKeys(raw: string): HomeWidgetDataKey[] {
  const requested = new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && isHomeWidgetDataKey(part)),
  );
  return HOME_WIDGET_DATA_KEYS.filter((key) => requested.has(key));
}

/** Serializa um conjunto de chaves para a query string, em ordem estável. */
export function serializeHomeWidgetDataKeys(
  keys: readonly HomeWidgetDataKey[],
): string {
  const set = new Set(keys);
  return HOME_WIDGET_DATA_KEYS.filter((key) => set.has(key)).join(",");
}
