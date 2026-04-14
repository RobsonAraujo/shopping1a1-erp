import type { StockPlanningConfig } from "@/config/stock-planning";

export type StockPlanningTooltips = {
  stockWillLast: string;
  search: string;
  activeStock: string;
  purchase: string;
};

export type StockPlanningDisplay = {
  stockWillLast: string;
  searchStartsOn: string | null;
  activeStockOn: string | null;
  purchaseStartsOn: string | null;
  searchIsOverdue: boolean;
  purchaseIsOverdue: boolean;
  searchStartsAtMs: number | null;
  purchaseStartsAtMs: number | null;
  needsSchedulingAttention: boolean;
  needsPurchaseAttention: boolean;
  tooltips: StockPlanningTooltips;
};

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function formatDatePtBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatLeadTimePhrase(leadTimeDays: number): string {
  if (leadTimeDays % 7 === 0 && leadTimeDays >= 7) {
    const w = leadTimeDays / 7;
    return `${w} ${w === 1 ? "semana" : "semanas"} (${leadTimeDays} dias)`;
  }
  return `${leadTimeDays} ${leadTimeDays === 1 ? "dia" : "dias"}`;
}

function formatNumPt(n: number, maxFractionDigits = 2): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function startOfLocalDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Cobertura em dias e datas derivadas a partir do estoque atual e vendas na janela.
 * Os dias de cobertura exibidos usam arredondamento para baixo (ex.: 3,4 → 3).
 */
export function computeStockPlanningDisplay(
  availableQuantity: number,
  unitsSoldInWindow: number,
  windowDays: number,
  config: StockPlanningConfig,
  purchaseLeadTimeDays = 0,
  now: Date = new Date(),
): StockPlanningDisplay {
  const salesDateHint =
    config.salesWindowDateField === "date_closed"
      ? "Janela por data de fechamento do pedido (exceto cancelados), busca com q=id do anúncio na API de pedidos."
      : "Janela por data de criação do pedido (exceto cancelados), busca com q=id do anúncio na API de pedidos.";

  const noSalesTooltip =
    `Sem vendas registradas nos últimos ${windowDays} dias neste anúncio (${salesDateHint}). Não dá para estimar cobertura nem datas.`;

  if (
    windowDays <= 0 ||
    unitsSoldInWindow <= 0 ||
    !Number.isFinite(availableQuantity)
  ) {
    return {
      stockWillLast:
        unitsSoldInWindow <= 0 ? "Sem vendas no período" : "—",
      searchStartsOn: null,
      activeStockOn: null,
      purchaseStartsOn: null,
      searchIsOverdue: false,
      purchaseIsOverdue: false,
      searchStartsAtMs: null,
      purchaseStartsAtMs: null,
      needsSchedulingAttention: false,
      needsPurchaseAttention: false,
      tooltips: {
        stockWillLast: noSalesTooltip,
        search: noSalesTooltip,
        activeStock: noSalesTooltip,
        purchase: noSalesTooltip,
      },
    };
  }

  const dailyAvg = unitsSoldInWindow / windowDays;
  const daysCoverage = availableQuantity / dailyAvg;
  const daysFloored =
    daysCoverage >= 1 ? Math.floor(daysCoverage) : 0;

  const stockWillLast =
    daysCoverage < 1
      ? "< 1 dia"
      : `${daysFloored.toLocaleString("pt-BR")} ${
          daysFloored === 1 ? "dia" : "dias"
        }`;

  const leadDays = config.leadTimeDays as number;
  const purchaseLeadDays = Math.max(0, purchaseLeadTimeDays);
  const totalPurchaseLeadDays = purchaseLeadDays + leadDays;
  const bufferDays = config.activeStockBufferDays as number;

  const stockoutAt = new Date(
    now.getTime() + daysCoverage * 24 * 60 * 60 * 1000,
  );
  const searchAt = addDays(stockoutAt, -leadDays);
  const purchaseAt = addDays(stockoutAt, -totalPurchaseLeadDays);
  const activeAt = addDays(stockoutAt, -bufferDays);

  const searchIsOverdue = searchAt.getTime() < now.getTime();
  const purchaseIsOverdue = purchaseAt.getTime() < now.getTime();
  const searchStartsAtMs = searchAt.getTime();
  const purchaseStartsAtMs = purchaseAt.getTime();
  const needsSchedulingAttention =
    startOfLocalDayMs(searchAt) <= startOfLocalDayMs(now);
  const needsPurchaseAttention =
    startOfLocalDayMs(purchaseAt) <= startOfLocalDayMs(now);

  const stockoutLabel = formatDatePtBR(stockoutAt);
  const leadPhrase = formatLeadTimePhrase(leadDays);
  const bufferPhrase =
    bufferDays === 1
      ? "1 dia antes do esgotamento previsto"
      : `${bufferDays} dias antes do esgotamento previsto`;

  const tooltips: StockPlanningTooltips = {
    stockWillLast: [
      `Este anúncio vendeu ${unitsSoldInWindow} ${
        unitsSoldInWindow === 1 ? "unidade" : "unidades"
      } nos últimos ${windowDays} dias (${salesDateHint}).`,
      `Média de ${formatNumPt(dailyAvg)} vendas por dia (${unitsSoldInWindow} ÷ ${windowDays}).`,
      `Estoque atual: ${availableQuantity} ${
        availableQuantity === 1 ? "unidade" : "unidades"
      }.`,
      `Cobertura estimada: estoque ÷ média diária ≈ ${formatNumPt(
        daysCoverage,
        1,
      )} dias; exibimos ${daysFloored} ${
        daysFloored === 1 ? "dia" : "dias"
      } (arredondado para baixo).`,
    ].join(" "),

    search: [
      `Esgotamento previsto (estoque zerar ao ritmo atual): ${stockoutLabel}.`,
      `Considerando um lead time de ${leadPhrase}, a busca/agendamento de reposição deve iniciar ${leadDays} ${
        leadDays === 1 ? "dia" : "dias"
      } antes desse momento: ${formatDatePtBR(searchAt)}.`,
    ].join(" "),

    purchase: [
      `Esgotamento previsto (estoque zerar ao ritmo atual): ${stockoutLabel}.`,
      `Para não faltar estoque, a compra precisa começar antes da soma dos prazos: compra (${purchaseLeadDays} ${
        purchaseLeadDays === 1 ? "dia" : "dias"
      }) + Full (${leadDays} ${leadDays === 1 ? "dia" : "dias"}) = ${totalPurchaseLeadDays} ${
        totalPurchaseLeadDays === 1 ? "dia" : "dias"
      }.`,
      `Data sugerida para iniciar compra: ${formatDatePtBR(purchaseAt)}.`,
    ].join(" "),

    activeStock: [
      `Esgotamento previsto: ${stockoutLabel}.`,
      `Para o novo estoque estar ativo ${bufferPhrase}, a data alvo é ${formatDatePtBR(
        activeAt,
      )} (margem de ${bufferDays} ${
        bufferDays === 1 ? "dia" : "dias"
      } antes do fim do estoque).`,
    ].join(" "),
  };

  return {
    stockWillLast,
    searchStartsOn: formatDatePtBR(searchAt),
    activeStockOn: formatDatePtBR(activeAt),
    purchaseStartsOn: formatDatePtBR(purchaseAt),
    searchIsOverdue,
    purchaseIsOverdue,
    searchStartsAtMs,
    purchaseStartsAtMs,
    needsSchedulingAttention,
    needsPurchaseAttention,
    tooltips,
  };
}
