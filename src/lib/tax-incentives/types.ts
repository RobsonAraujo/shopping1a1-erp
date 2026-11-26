/** Quem tem direito ao incentivo na venda interna. */
export type IcmsIncentiveAppliesTo = "all" | "contribuinte";

/**
 * Incentivo fiscal de ICMS de um NCM (por organização): na venda interna, o
 * ICMS de débito passa a ser `ratePercent` — o % final, já com o incentivo —
 * no lugar da alíquota da tabela da UF. Crédito da compra, venda
 * interestadual e ICMS-ST não mudam.
 */
export type IcmsIncentiveRule = {
  /** 8 dígitos, sem pontos. */
  ncm: string;
  /** Carga final na venda interna, em % (ex.: 12). Substitui base + FCP. */
  ratePercent: number;
  appliesTo: IcmsIncentiveAppliesTo;
  /** `YYYY-MM-DD` inclusive; null = sem limite. */
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
  updatedAt: string;
};

/** Regras da organização por NCM normalizado. */
export type IcmsIncentiveIndex = ReadonlyMap<string, IcmsIncentiveRule>;

/** Incentivo que vale para uma venda (gravado na venda do Tributário). */
export type IcmsIncentivoVenda = {
  ncm: string;
  aliquotaPercent: number;
  appliesTo: IcmsIncentiveAppliesTo;
};

/** Resposta de `/api/tax-incentives` (GET/PUT/DELETE). */
export type IcmsIncentiveScreenData = {
  rules: Array<IcmsIncentiveRule & { productCount: number }>;
  /** UF da empresa — a venda interna é para esta UF. */
  originUf: string;
  /** Alíquota interna da tabela da UF da empresa (base + FCP), em %. */
  internalRatePercent: number;
  taxRegime: "LUCRO_REAL" | "LUCRO_PRESUMIDO" | "SIMPLES";
};
