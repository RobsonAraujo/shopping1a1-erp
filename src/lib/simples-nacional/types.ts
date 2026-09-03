import type { StatusTone } from "@/lib/ui/tone";

/** Composição percentual do DAS por tributo embutido — soma 100 dentro de cada faixa. */
export type AnexoComposicaoPercentual = {
  irpj: number;
  csll: number;
  cpp: number;
  cofins: number;
  pis: number;
  icms: number;
};

export type AnexoFaixa = {
  faixa: 1 | 2 | 3 | 4 | 5 | 6;
  rbt12Min: number;
  rbt12Max: number;
  aliquotaNominalPercent: number;
  parcelaDeduzir: number;
  composicaoPercentual: AnexoComposicaoPercentual;
};

export type Rbt12MonthRevenue = {
  year: number;
  month: number;
  revenue: number;
  /** De onde veio o valor na última vez que foi calculado — cache já salvo, snapshot do DRE, ou busca ao vivo no ML. */
  source: "cache" | "dre_snapshot" | "ml_live";
  /** Quando esse valor foi calculado (não quando foi lido agora) — ISO string. */
  computedAt: string;
};

export type Rbt12Result = {
  /** Ano/mês de referência (a apuração em si, não incluído na soma). */
  referenceYear: number;
  referenceMonth: number;
  rbt12Total: number;
  months: Rbt12MonthRevenue[];
  faixa: AnexoFaixa;
  aliquotaEfetivaNominal: number;
  proximidadeLimite: {
    tone: StatusTone;
    mensagem: string;
  };
  /** O mais antigo `computedAt` entre os 12 meses — pior caso de "desatualização" pra mostrar na UI. */
  oldestComputedAt: string;
};

/**
 * Comparação por SKU — `lucroRealPercent` varia por produto (vem da apuração
 * simulada); `simplesAliquotaEfetivaPercent` (no `SimulacaoComparacao` pai) é
 * a MESMA para todo SKU, por definição de como o DAS funciona (cobrado sobre
 * o faturamento total do mês, não por anúncio) — não repetido aqui.
 */
export type SimulacaoSkuComparacao = {
  sku: string;
  mlItemId?: string;
  receitaTotal: number;
  lucroRealPercent: number;
  /** simplesAliquotaEfetivaPercent − lucroRealPercent. Positivo = Simples pesa mais nesse produto. */
  diferencaPercent: number;
};

export type SimulacaoComparacao = {
  year: number;
  month: number;
  faturamento: number;
  dasPago: number;
  impostoOperacionalSimulado: number;
  diferenca: number;
  simplesAliquotaEfetivaPercent: number;
  porSku: SimulacaoSkuComparacao[];
};
