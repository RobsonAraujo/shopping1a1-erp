import type { StockPlanningConfig } from "@/config/stock-planning";

export type StockPlanningTooltips = {
  stockWillLast: string;
  search: string;
  activeStock: string;
};

export type StockPlanningDisplay = {
  stockWillLast: string;
  searchStartsOn: string | null;
  activeStockOn: string | null;
  searchIsOverdue: boolean;
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

/**
 * Cobertura em dias e datas derivadas a partir do estoque atual e vendas na janela.
 * Os dias de cobertura exibidos usam arredondamento para baixo (ex.: 3,4 → 3).
 */
export function computeStockPlanningDisplay(
  availableQuantity: number,
  unitsSoldInWindow: number,
  windowDays: number,
  config: StockPlanningConfig,
  now: Date = new Date(),
): StockPlanningDisplay {
  const salesDateHint =
    config.salesWindowDateField === "date_closed"
      ? "Janela por data de fechamento do pedido (pago/confirmado), busca com q=id do anúncio na API de pedidos."
      : "Janela por data de criação do pedido, busca com q=id do anúncio na API de pedidos.";

  const noSalesTooltip =
    `Sem vendas registradas nos últimos ${windowDays} dias neste anúncio (pedidos pagos; ${salesDateHint}). Não dá para estimar cobertura nem datas.`;

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
      searchIsOverdue: false,
      tooltips: {
        stockWillLast: noSalesTooltip,
        search: noSalesTooltip,
        activeStock: noSalesTooltip,
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
  const bufferDays = config.activeStockBufferDays as number;

  const stockoutAt = new Date(
    now.getTime() + daysCoverage * 24 * 60 * 60 * 1000,
  );
  const searchAt = addDays(stockoutAt, -leadDays);
  const activeAt = addDays(stockoutAt, -bufferDays);

  const searchIsOverdue = searchAt.getTime() < now.getTime();

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
    searchIsOverdue,
    tooltips,
  };
}
