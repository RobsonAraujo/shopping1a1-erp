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
};

export type IrpjCsllBreakdown = {
  baseLucro: number;
  irpjBase: number;
  csll: number;
  irpjAdicional: number;
  irpjTotal: number;
  isEstimativaGerencial: true;
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
  irpjCsll: IrpjCsllBreakdown | null;
  cbsIbs: CbsIbsInformativo | null;
  impostoTotal: number;
  margemLiquidaEstimada: number;
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
  transacoes: DetalhamentoTributario[];
};

export type RelatorioConsolidado = {
  faturamento: number;
  pisCofinsLiquido: number;
  icmsDifalTotal: number;
  irpjEstimado: number;
  csllEstimado: number;
  cbsIbsInformativoTotal: number;
  margemLiquida: number;
  transacoesIncluidas: number;
  transacoesExcluidas: number;
  transacoesSemBillingInfo: number;
};

export type TaxReportPayload = {
  year: number;
  month: number;
  consolidado: RelatorioConsolidado;
  porSku: SkuAggregation[];
  transacoes: DetalhamentoTributario[];
  overrides: Record<string, ManualFiscalOverride>;
  meta: {
    geradoEm: string;
    pedidosProcessados: number;
    linhasProcessadas: number;
    semBillingInfo: number;
    duracaoMs: number;
    taxRegime: string;
    originUf: string;
    contributorVerification: {
      mode: "stub" | "cnpj_ws";
      cnpjWsEnabled: boolean;
      stubFallbackCount: number;
      warnings: string[];
    };
  };
};

export type TaxCompanyConfig = {
  taxRegime: "LUCRO_REAL" | "LUCRO_PRESUMIDO" | "SIMPLES";
  originUf: string;
  pisRatePercent: number;
  cofinsRatePercent: number;
  excludeIcmsFromPisCofinsBase: boolean;
  irpjAdditionalThreshold: number;
};

export type IcmsRateRow = {
  uf: string;
  aliquotaBase: number;
  fcp: number;
};
