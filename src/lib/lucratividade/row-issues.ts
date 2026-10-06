import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";

export type TaxRegime = "LUCRO_REAL" | "LUCRO_PRESUMIDO" | "SIMPLES";

export type LucratividadeTaxContext = {
  taxRegime: TaxRegime;
  /** Simples: alíquota efetiva cadastrada em Configurações › Empresa. */
  simplesRateConfigured: boolean;
};

/** Pendência de um anúncio — `blocker` tira o anúncio da média. */
export type RowIssue = {
  key: string;
  severity: "blocker" | "warning";
  title: string;
  detail: string;
  action?: { label: string; href: string };
};

const PRODUCTS_HREF = "/dashboard/produtos";
const COMPANY_SETTINGS_HREF = "/dashboard/configuracoes/empresa";
const TAX_REPORT_HREF = "/dashboard/tributario";

/** Como resolver a falta de alíquota — depende do regime da empresa. */
export function missingTaxIssue(ctx: LucratividadeTaxContext): RowIssue {
  if (ctx.taxRegime === "SIMPLES") {
    return {
      key: "missing_tax",
      severity: "blocker",
      title: "Alíquota do Simples não configurada",
      detail:
        "Sem a alíquota efetiva do Simples, o imposto fica zerado e a margem, inflada.",
      action: { label: "Configurar alíquota", href: COMPANY_SETTINGS_HREF },
    };
  }
  return {
    key: "missing_tax",
    severity: "blocker",
    title: "Sem alíquota apurada",
    detail:
      "A alíquota vem do relatório tributário do último mês fechado. SKU novo (ou que não vendeu nesse mês) só ganha alíquota quando o mês for calculado em Tributário.",
    action: { label: "Abrir Tributário", href: TAX_REPORT_HREF },
  };
}

export function buildRowIssues(
  row: Pick<
    FinancialEvaluationRow,
    | "sku"
    | "isKit"
    | "isKitComposition"
    | "kitMissingSkus"
    | "productCost"
    | "taxRatePercent"
    | "errors"
    | "warnings"
  >,
  ctx: LucratividadeTaxContext,
): RowIssue[] {
  const issues: RowIssue[] = [];

  if (row.errors.length > 0) {
    issues.push({
      key: "errors",
      severity: "blocker",
      title: "Erro ao consultar o Mercado Livre",
      detail: row.errors.join(" "),
    });
  }

  if (!row.sku && row.isKit && !row.isKitComposition) {
    issues.push({
      key: "kit_without_composition",
      severity: "blocker",
      title: "Kit sem composição cadastrada",
      detail:
        "Anúncio kit sem SKU próprio: cadastre quais produtos formam o kit para calcular custo e imposto.",
      action: { label: "Cadastrar kit", href: PRODUCTS_HREF },
    });
  } else if (row.kitMissingSkus && row.kitMissingSkus.length > 0) {
    issues.push({
      key: "kit_incomplete",
      severity: "blocker",
      title: "Kit incompleto",
      detail: `Componente(s) sem cadastro em Meus produtos: ${row.kitMissingSkus.join(", ")}. O custo do kit fica parcial.`,
      action: { label: "Cadastrar componentes", href: PRODUCTS_HREF },
    });
  } else if (!row.sku && !row.isKitComposition) {
    issues.push({
      key: "missing_sku",
      severity: "blocker",
      title: "Anúncio sem SKU",
      detail:
        "Cadastre o produto em Meus produtos com o mesmo SKU do anúncio para trazer o custo.",
      action: { label: "Ir para Meus produtos", href: PRODUCTS_HREF },
    });
  } else if (row.productCost === null) {
    issues.push({
      key: "missing_cost",
      severity: "blocker",
      title: "Sem custo cadastrado",
      detail: `Preencha o custo de precificação${row.sku ? ` do SKU ${row.sku}` : ""} em Meus produtos.`,
      action: { label: "Cadastrar custo", href: PRODUCTS_HREF },
    });
  }

  if (row.taxRatePercent === null) {
    issues.push(missingTaxIssue(ctx));
  }

  for (const warning of row.warnings) {
    issues.push({
      key: `warning:${warning}`,
      severity: "warning",
      title: "Atenção",
      detail: warning,
    });
  }

  return issues;
}
