export type BuyerDocumentType = "CPF" | "CNPJ" | "UNKNOWN";

export type TaxpayerSource =
  | "ml_taxpayer_type"
  | "external_api"
  | "stub_fallback"
  | "manual_override";

export type TransacaoVenda = {
  transactionKey: string;
  orderId: string;
  orderDate: string;
  sku: string;
  itemId: string;
  quantidade: number;
  receitaBruta: number;
  ufDestino: string | null;
  tipoDocumento: BuyerDocumentType;
  documento: string | null;
  contribuinteIcms: boolean | null;
  contribuinteSource: TaxpayerSource | null;
  dadosFiscaisIndisponiveis: boolean;
  custoAquisicaoUnitario: number | null;
  /** Custo unitário na NF de entrada — base para créditos fiscais. */
  unitCostNf: number | null;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
  /** % ICMS na venda (cadastro) — usado em operação interna e precificação. */
  saleIcmsPercent: number;
  extraCostsUnitario: number;
  mercadoriaImportada: boolean;
  conteudoImportacaoPercentual: number;
  isMonophasic: boolean;
};

export type ManualFiscalOverride = {
  ufDestino: string;
  contribuinteIcms: boolean;
  tipoDocumento?: BuyerDocumentType;
};

export type PisCofinsBreakdown = {
  baseDebito: number;
  baseCredito: number;
  pisDebito: number;
  cofinsDebito: number;
  debitoTotal: number;
  pisCredito: number;
  cofinsCredito: number;
  creditoTotal: number;
  liquido: number;
  icmsExcluidoDaBase: number;
  excludedIcmsFromBase: boolean;
};

export type IcmsCreditoCompraBreakdown = {
  baseUnitaria: number;
  aliquotaPercent: number;
  creditoTotal: number;
};

export type IcmsDifalBreakdown = {
  ufOrigem: string;
  ufDestino: string;
  aliquotaInterestadual: number;
  aliquotaInternaTotal: number;
  icmsInterestadual: number;
  difal: number;
  icmsTotal: number;
  isContribuinte: boolean;
  isOperacaoInterna: boolean;
  /** Alíquota efetiva na saída (operação interna). */
  aliquotaSaidaEfetiva?: number;
  /** Indica ST na compra (operação interna). */
  icmsStNaCompra?: boolean;
};

export type CbsIbsInformativo = {
  year: number;
  cbs: number | null;
  ibsEstadual: number | null;
  ibsMunicipal: number | null;
  valorCbs: number | null;
  valorIbs: number | null;
  notes: string | null;
};

export type DetalhamentoTributario = {
  transacao: TransacaoVenda;
  pisCofins: PisCofinsBreakdown | null;
  icmsDifal: IcmsDifalBreakdown | null;
  icmsCreditoCompra: IcmsCreditoCompraBreakdown | null;
  cbsIbs: CbsIbsInformativo | null;
  /** PIS/COFINS líquido + ICMS total (imposto operacional). */
  impostoTotal: number;
  margemOperacionalEstimada: number;
  /** @deprecated Snapshots antigos — use margemOperacionalEstimada */
  margemLiquidaEstimada?: number;
  /** @deprecated Snapshots antigos — removido do cálculo */
  irpjCsll?: unknown;
  incluidoNaApuracao: boolean;
  memoriaCalculo: string[];
};

export type SkuAggregation = {
  sku: string;
  quantidadeVendas: number;
  unidadesVendidas: number;
  receitaTotal: number;
  impostoTotal: number;
  impostoMedioPorVenda: number;
  impostoMedioPercentual: number;
  /** PIS/COFINS + ICMS (sem IRPJ/CSLL). Ausente em snapshots antigos — calculado na leitura. */
  impostoOperacionalTotal?: number;
  impostoOperacionalMedioPorVenda?: number;
  impostoOperacionalMedioPercentual?: number;
  /** SKUs antigos/alternativos unificados nesta linha. */
  skuAliases?: string[];
  transacoes: DetalhamentoTributario[];
};

export type ApuracaoImpostoLinha = {
  debito: number;
  credito: number;
  liquido: number;
};

export type ApuracaoDiagnostico = {
  receitaSemCustoCadastrado: number;
  linhasSemCustoCadastrado: number;
  creditoPisCofinsPerdidoEstimado: number;
};

export type ApuracaoConsolidada = {
  pis: ApuracaoImpostoLinha;
  cofins: ApuracaoImpostoLinha;
  pisCofinsLiquido: number;
  icms: ApuracaoImpostoLinha & {
    icmsSemDifalDebito: number;
    difalDebito: number;
  };
  icmsARecolherSpEstimado: number;
  difalARecolherEstimado: number;
  difalPorUf: Record<string, number>;
  diagnostico: ApuracaoDiagnostico;
};

export type RelatorioConsolidado = {
  faturamento: number;
  pisCofinsLiquido: number;
  apuracao?: ApuracaoConsolidada;
  /** ICMS interno ou interestadual (sem DIFAL). Ausente em snapshots antigos. */
  icmsSemDifalTotal?: number;
  /** DIFAL (UF destino, EC 87/2015). Ausente em snapshots antigos. */
  difalTotal?: number;
  icmsDifalTotal: number;
  cbsIbsInformativoTotal: number;
  margemOperacional: number;
  /** @deprecated Snapshots antigos — use margemOperacional */
  margemLiquida?: number;
  /** @deprecated Snapshots antigos — removido do cálculo */
  irpjEstimado?: number;
  /** @deprecated Snapshots antigos — removido do cálculo */
  csllEstimado?: number;
  transacoesIncluidas: number;
  transacoesExcluidas: number;
  transacoesSemBillingInfo: number;
};

export type TaxReportPayload = {
  year: number;
  month: number;
  consolidado: RelatorioConsolidado;
  porSku: SkuAggregation[];
  /** Detalhes por venda na raiz; vazio em snapshots persistidos (ver porSku[].transacoes). */
  transacoes?: DetalhamentoTributario[];
  overrides: Record<string, ManualFiscalOverride>;
  meta: {
    geradoEm: string;
    pedidosProcessados: number;
    linhasProcessadas: number;
    semBillingInfo: number;
    duracaoMs: number;
    taxRegime: string;
    originUf: string;
  };
};

export type TaxCompanyConfig = {
  taxRegime: "LUCRO_REAL" | "LUCRO_PRESUMIDO" | "SIMPLES";
  originUf: string;
  pisRatePercent: number;
  cofinsRatePercent: number;
  excludeIcmsFromPisCofinsBase: boolean;
};

export type IcmsRateRow = {
  uf: string;
  aliquotaBase: number;
  fcp: number;
};
