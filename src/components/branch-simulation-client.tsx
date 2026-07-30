"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Save, Trash2, Truck } from "lucide-react";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { MaskedPercentField } from "@/components/financial-cost-input-fields";
import { PlanningInfoTrigger } from "@/components/planning-info-trigger";
import { readApiError } from "@/lib/api-client-error";
import { filterByItemListSearch } from "@/lib/item-list-search";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  roundMoney,
} from "@/lib/financial-margin";
import { BRAZILIAN_UF_OPTIONS } from "@/lib/tax-report/brazilian-ufs";
import { TAX_REPORT_MONTH_NAMES } from "@/lib/tax-report/routes";
import { getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import { cn } from "@/lib/utils";

type Period = { year: number; month: number; generatedAt: string };

type SimulationComponent = { atual: number; cenario: number };

type EntradaInfo = {
  fornecedor: string;
  ufFornecedor: string;
  isOperacaoInterna: boolean;
  purchaseIcmsPercentEstimado: number;
};

type IncentivoCenarioAgg = {
  cargaEfetivaAlvoPercent: number;
  receitaInterestadual: number;
  icmsInterestadualBruto: number;
  creditoPresumidoValor: number;
  icmsInterestadualLiquido: number;
  difal: number;
  icmsTotalInterestadual: number;
  linhasComIncentivo: number;
  linhasInterestaduaisSemIncentivo: number;
  linhasInternas: number;
};

type SimulationRow = {
  key: string;
  receitaTotal: number;
  atual: number;
  cenario: number;
  economia: number;
  economiaPercent: number;
  atualPercent: number;
  cenarioPercent: number;
  icmsDebito: SimulationComponent;
  icmsCreditoEntrada: SimulationComponent;
  icmsStRecuperavel: SimulationComponent;
  pisCofinsLiquido: SimulationComponent;
  incentivoCenario: IncentivoCenarioAgg;
  entradaInfo?: EntradaInfo | null;
};

type SkuUfRow = SimulationRow & {
  sku: string;
  uf: string;
  aliquotaInterestadual: number;
  aliquotaInternaDestino: number;
  isOperacaoInterna: boolean;
  contribuinteMisto: boolean;
};

type SimulationResult = {
  transacoesConsideradas: number;
  incentivoInterpretacao: string;
  cargaEfetivaAlvoPercent: number;
  totais: SimulationRow;
  porSku: SimulationRow[];
  porUf: SimulationRow[];
  porSkuUf: SkuUfRow[];
};

type ComparisonEntry = {
  uf: string;
  creditoPresumidoPercent: number;
  totais: SimulationRow;
};

/** Referência de mercado (pesquisada) usada só como default editável — nunca fixo no cálculo. */
const INCENTIVE_UF_DEFAULTS: Record<string, number> = {
  SC: 1.4,
  ES: 1.1,
  PR: 0.4,
  RS: 1.5,
  MG: 0,
  RJ: 0,
  SP: 0,
};

type SavedScenario = {
  id: string;
  name: string;
  periods: { year: number; month: number }[];
  targetUf: string;
  creditoPresumidoPercent: number;
  savedAt: string;
};

const SCENARIOS_STORAGE_KEY = "branch-simulation-scenarios";

const INCENTIVE_REFERENCE_TEXT =
  "Informe a carga efetiva de ICMS próprio da origem sobre a receita (não um % de desconto sobre o ICMS). " +
  "Ex.: SC/TTD ~1,4% significa que, nas vendas interestaduais, o ICMS da origem cai para ~1,4% da receita; " +
  "o crédito presumido = ICMS interestadual bruto − (receita × 1,4%). O DIFAL (UF destino) não é reduzido. " +
  "0% desliga o incentivo. Confirme o percentual real com sua contabilidade. " +
  "Referências de mercado: SC (TTD 409/410/411) ~1,4%; ES (COMPETE) ~1,1%; " +
  "PR (Paraná Competitivo) ~0,4%; RS ~1,5%; MG/RJ/SP sem default (0%).";

const PERIODS_INFO_TEXT =
  "Os meses marcados são somados num único cálculo — não é uma média por mês, é o total de vendas incluídas na apuração desses meses combinados. " +
  "1 mês selecionado mostra o retrato daquele período (pode ser afetado por sazonalidade ou uma UF que puxou volume fora do padrão). " +
  "Vários meses selecionados dão uma amostra mais representativa, mas o \"% médio\" por SKU pode mudar conforme os meses escolhidos, " +
  "especialmente para produtos cuja distribuição de vendas por UF varia — isso muda a proporção de vendas internas vs. interestaduais no cenário.";

const SKU_TABLE_INFO_TEXT =
  "Soma, por SKU (produto), o imposto de todas as vendas incluídas nos meses selecionados: o que foi apurado de fato (origem atual) vs. o que teria sido apurado se a venda tivesse saído da UF alvo. Ajuda a ver quais produtos mais se beneficiariam da filial.";

const UF_TABLE_INFO_TEXT =
  "Agrupa pela UF de destino da venda (onde está o comprador), não pela origem. Cada linha compara, para as vendas feitas àquele estado, o imposto atual (saindo da UF de origem hoje) vs. o cenário (saindo da UF alvo) — mostra em quais estados de destino a mudança de origem mais pesa, porque muda a relação interna/interestadual (e o DIFAL) dessas vendas.";

function periodKey(p: { year: number; month: number }): string {
  return `${p.year}-${p.month}`;
}

function periodLabel(p: { year: number; month: number }): string {
  return `${TAX_REPORT_MONTH_NAMES[p.month - 1] ?? p.month}/${p.year}`;
}

function loadScenarios(): SavedScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCENARIOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveScenarios(scenarios: SavedScenario[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(scenarios));
}

const SUPPLIER_UF_STORAGE_KEY = "branch-simulation-supplier-ufs";
const CREDITO_PRESUMIDO_BY_UF_STORAGE_KEY =
  "branch-simulation-credito-presumido-by-uf";
/** Formato antigo (número único) — migrado para o mapa por UF. */
const CREDITO_PRESUMIDO_LEGACY_STORAGE_KEY =
  "branch-simulation-credito-presumido";

function loadSupplierUfMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SUPPLIER_UF_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSupplierUfMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SUPPLIER_UF_STORAGE_KEY, JSON.stringify(map));
}

function sanitizeCreditoByUf(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [uf, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      out[uf] = value;
    }
  }
  return out;
}

function loadCreditoPresumidoByUf(): Record<string, number> {
  const base = { ...INCENTIVE_UF_DEFAULTS };
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(CREDITO_PRESUMIDO_BY_UF_STORAGE_KEY);
    if (raw !== null) {
      return { ...base, ...sanitizeCreditoByUf(JSON.parse(raw)) };
    }
    // Migra valor único antigo para SC (UF alvo padrão).
    const legacy = window.localStorage.getItem(CREDITO_PRESUMIDO_LEGACY_STORAGE_KEY);
    if (legacy !== null) {
      const parsed = JSON.parse(legacy) as unknown;
      if (typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0) {
        const migrated = { ...base, SC: parsed };
        window.localStorage.setItem(
          CREDITO_PRESUMIDO_BY_UF_STORAGE_KEY,
          JSON.stringify(migrated),
        );
        window.localStorage.removeItem(CREDITO_PRESUMIDO_LEGACY_STORAGE_KEY);
        return migrated;
      }
    }
    return base;
  } catch {
    return base;
  }
}

function saveCreditoPresumidoByUf(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CREDITO_PRESUMIDO_BY_UF_STORAGE_KEY,
    JSON.stringify(map),
  );
}

function creditoForUf(
  map: Record<string, number>,
  uf: string,
): number {
  return map[uf] ?? INCENTIVE_UF_DEFAULTS[uf] ?? 0;
}

/** Diferença em pontos percentuais entre o % médio do cenário e o atual. */
function PercentPointsDelta({
  atualPercent,
  cenarioPercent,
}: {
  atualPercent: number;
  cenarioPercent: number;
}) {
  const delta = roundMoney(cenarioPercent - atualPercent);
  if (delta === 0) {
    return <span className="text-xs font-normal text-[var(--muted-foreground)]">(=)</span>;
  }
  const isGain = delta < 0;
  return (
    <span
      className={cn(
        "text-xs font-normal",
        isGain
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      ({delta > 0 ? "+" : ""}
      {delta.toFixed(2)} p.p.)
    </span>
  );
}

function MemoriaComponentRow({
  label,
  component,
  invertColor,
}: {
  label: string;
  component: SimulationComponent;
  invertColor?: boolean;
}) {
  const delta = roundMoney(component.cenario - component.atual);
  const isGain = invertColor ? delta > 0 : delta < 0;
  const isLoss = invertColor ? delta < 0 : delta > 0;
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">{label}</td>
      <td className="px-3 py-2 text-right text-xs tabular-nums">
        {formatFinancialMoney(component.atual)}
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">
        {formatFinancialMoney(component.cenario)}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right text-xs tabular-nums font-medium",
          isGain
            ? "text-emerald-600 dark:text-emerald-400"
            : isLoss
              ? "text-red-600 dark:text-red-400"
              : "text-[var(--muted-foreground)]",
        )}
      >
        {delta > 0 ? "+" : ""}
        {formatFinancialMoney(delta)}
      </td>
    </tr>
  );
}

/** Memória de cálculo agregada: explica de onde vem a mudança do imposto entre atual e cenário. */
function MemoriaCalculoPanel({
  row,
  skuUfRows,
  incentivoInterpretacao,
}: {
  row: SimulationRow;
  skuUfRows: SkuUfRow[];
  incentivoInterpretacao?: string;
}) {
  const inc = row.incentivoCenario;
  const cargaEfetivaLiquidaPercent =
    inc.receitaInterestadual > 0
      ? roundMoney((inc.icmsInterestadualLiquido / inc.receitaInterestadual) * 100)
      : 0;
  const cargaEfetivaBrutaPercent =
    inc.receitaInterestadual > 0
      ? roundMoney((inc.icmsInterestadualBruto / inc.receitaInterestadual) * 100)
      : 0;

  return (
    <tr className="border-t border-[var(--border)] bg-[var(--muted)]/10">
      <td colSpan={6} className="px-4 py-3">
        <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">
          Memória de cálculo — {row.key}
        </p>

        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs">
          <p className="mb-1 font-semibold text-[var(--foreground)]">
            Incentivo / crédito presumido (cenário)
          </p>
          {incentivoInterpretacao ? (
            <p className="mb-2 text-[var(--muted-foreground)]">{incentivoInterpretacao}</p>
          ) : null}
          {inc.cargaEfetivaAlvoPercent <= 0 ? (
            <p className="text-[var(--muted-foreground)]">
              Carga efetiva alvo = 0% — incentivo desligado neste cenário. O ICMS
              interestadual do cenário fica na alíquota cheia (12%/7%/4%).
            </p>
          ) : inc.receitaInterestadual <= 0 ? (
            <p className="text-[var(--muted-foreground)]">
              Sem vendas interestaduais neste agrupamento — o incentivo não
              incide (só operações internas ou sem ICMS).
            </p>
          ) : (
            <div className="space-y-1 text-[var(--muted-foreground)]">
              <p>
                Carga efetiva alvo informada:{" "}
                <strong>{inc.cargaEfetivaAlvoPercent.toFixed(2)}%</strong> sobre
                a receita interestadual.
              </p>
              <p>
                Receita interestadual:{" "}
                <strong>{formatFinancialMoney(inc.receitaInterestadual)}</strong>
                {" · "}
                {inc.linhasComIncentivo} venda(s) com incentivo aplicado
                {inc.linhasInterestaduaisSemIncentivo > 0
                  ? ` · ${inc.linhasInterestaduaisSemIncentivo} interestadual(is) sem crédito`
                  : ""}
                {inc.linhasInternas > 0
                  ? ` · ${inc.linhasInternas} interna(s) (sem incentivo)`
                  : ""}
              </p>
              <p>
                ICMS interestadual bruto (
                {cargaEfetivaBrutaPercent.toFixed(2)}% efetivo):{" "}
                <strong>{formatFinancialMoney(inc.icmsInterestadualBruto)}</strong>
              </p>
              <p>
                (−) Crédito presumido = bruto − (receita ×{" "}
                {inc.cargaEfetivaAlvoPercent.toFixed(2)}%):{" "}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {formatFinancialMoney(inc.creditoPresumidoValor)}
                </strong>
              </p>
              <p>
                ICMS interestadual líquido (
                {cargaEfetivaLiquidaPercent.toFixed(2)}% efetivo):{" "}
                <strong>
                  {formatFinancialMoney(inc.icmsInterestadualLiquido)}
                </strong>
              </p>
              <p>
                DIFAL (UF destino — <em>não</em> reduzido pelo incentivo):{" "}
                <strong>{formatFinancialMoney(inc.difal)}</strong>
              </p>
              <p>
                ICMS total interestadual no cenário (líquido + DIFAL):{" "}
                <strong>
                  {formatFinancialMoney(inc.icmsTotalInterestadual)}
                </strong>
              </p>
            </div>
          )}
        </div>

        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs">
          <p className="mb-1 font-semibold text-[var(--foreground)]">Compra</p>
          {row.entradaInfo ? (
            <p className="text-[var(--muted-foreground)]">
              Fornecedor <strong>{row.entradaInfo.fornecedor}</strong> (UF{" "}
              {row.entradaInfo.ufFornecedor}) → filial: operação{" "}
              <strong>
                {row.entradaInfo.isOperacaoInterna ? "interna" : "interestadual"}
              </strong>
              , alíquota de entrada estimada{" "}
              <strong>{row.entradaInfo.purchaseIcmsPercentEstimado.toFixed(2)}%</strong>{" "}
              no cenário. Nenhum DIFAL incide sobre compra de mercadoria para
              revenda — o que muda aqui é só a alíquota do crédito de entrada.
            </p>
          ) : (
            <p className="text-[var(--muted-foreground)]">
              SKU sem UF de fornecedor informada — o cenário usa o mesmo ICMS
              de compra cadastrado hoje (não recalculado).
            </p>
          )}
        </div>

        {skuUfRows.length > 0 ? (
          <div className="mb-3 overflow-x-auto rounded-lg border border-[var(--border)]">
            <p className="border-b border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Venda por UF de destino
            </p>
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="bg-[var(--muted)]/30 text-left text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  <th className="px-3 py-2">UF</th>
                  <th className="px-3 py-2">Operação</th>
                  <th className="px-3 py-2 text-right">Alíq. interest.</th>
                  <th className="px-3 py-2 text-right">Alíq. interna dest.</th>
                  <th className="px-3 py-2 text-right">Crédito presumido</th>
                  <th className="px-3 py-2 text-right">Débito atual</th>
                  <th className="px-3 py-2 text-right">Débito cenário</th>
                </tr>
              </thead>
              <tbody>
                {skuUfRows.map((r) => (
                  <tr key={r.uf} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-xs font-medium">
                      {r.uf}
                      {r.contribuinteMisto ? (
                        <span
                          className="ml-1 text-[10px] text-amber-600 dark:text-amber-400"
                          title="Mistura vendas a comprador contribuinte e não-contribuinte — DIFAL não é uniforme nessas vendas."
                        >
                          ★
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                      {r.isOperacaoInterna ? "Interna" : "Interestadual"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {r.isOperacaoInterna ? "—" : `${r.aliquotaInterestadual.toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {r.aliquotaInternaDestino.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {r.isOperacaoInterna ||
                      r.incentivoCenario.creditoPresumidoValor <= 0
                        ? "—"
                        : formatFinancialMoney(
                            r.incentivoCenario.creditoPresumidoValor,
                          )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {formatFinancialMoney(r.icmsDebito.atual)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">
                      {formatFinancialMoney(r.icmsDebito.cenario)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="bg-[var(--muted)]/30 text-left text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                <th className="px-3 py-2">Componente</th>
                <th className="px-3 py-2 text-right">Atual</th>
                <th className="px-3 py-2 text-right">Cenário</th>
                <th className="px-3 py-2 text-right">Diferença</th>
              </tr>
            </thead>
            <tbody>
              <MemoriaComponentRow
                label="Receita bruta"
                component={{ atual: row.receitaTotal, cenario: row.receitaTotal }}
              />
              <MemoriaComponentRow
                label="ICMS débito (venda)"
                component={row.icmsDebito}
              />
              <MemoriaComponentRow
                label="(−) Crédito ICMS entrada"
                component={row.icmsCreditoEntrada}
                invertColor
              />
              <MemoriaComponentRow
                label="(−) ICMS-ST recuperável"
                component={row.icmsStRecuperavel}
                invertColor
              />
              <MemoriaComponentRow
                label="PIS/COFINS líquido"
                component={row.pisCofinsLiquido}
              />
              <tr className="border-t border-[var(--border)] bg-[var(--primary)]/5 font-semibold">
                <td className="px-3 py-2 text-xs">Imposto operacional total</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {formatFinancialMoney(row.atual)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {formatFinancialMoney(row.cenario)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {formatFinancialMoney(row.economia)} (
                  {formatFinancialPercent(row.economiaPercent)})
                </td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  % médio sobre a receita
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {formatFinancialPercent(row.atualPercent)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">
                  {formatFinancialPercent(row.cenarioPercent)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  <PercentPointsDelta
                    atualPercent={row.atualPercent}
                    cenarioPercent={row.cenarioPercent}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function ResultTable({
  title,
  infoText,
  rows,
  keyLabel,
  searchable,
  expandable,
  expandedKey: controlledExpandedKey,
  onToggleExpand,
  skuUfRows,
  incentivoInterpretacao,
}: {
  title: string;
  infoText?: string;
  rows: SimulationRow[];
  keyLabel: string;
  searchable?: boolean;
  expandable?: boolean;
  expandedKey?: string | null;
  onToggleExpand?: (key: string) => void;
  skuUfRows?: SkuUfRow[];
  incentivoInterpretacao?: string;
}) {
  const [query, setQuery] = useState("");
  const [internalExpandedKey, setInternalExpandedKey] = useState<string | null>(null);
  const expandedKey =
    controlledExpandedKey !== undefined ? controlledExpandedKey : internalExpandedKey;
  const toggleExpand =
    onToggleExpand ??
    ((key: string) =>
      setInternalExpandedKey((current) => (current === key ? null : key)));
  const filtered = useMemo(
    () =>
      searchable
        ? filterByItemListSearch(rows, query, (row) => ({ sku: row.key }))
        : rows,
    [rows, query, searchable],
  );

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {infoText ? <PlanningInfoTrigger content={infoText} /> : null}
      </div>
      {searchable ? (
        <div className="border-b border-[var(--border)] px-4 py-3">
          <ItemListSearch
            value={query}
            onChange={setQuery}
            filteredCount={filtered.length}
            totalCount={rows.length}
            placeholder="Buscar por SKU…"
            entitySingular="produto"
            entityPlural="produtos"
          />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-left text-xs text-[var(--muted-foreground)]">
              <th className="px-4 py-2.5">{keyLabel}</th>
              <th className="px-4 py-2.5 text-right">Imposto atual</th>
              <th className="px-4 py-2.5 text-right">
                % médio atual
                <span className="block text-[10px] normal-case">
                  (para precificação)
                </span>
              </th>
              <th className="px-4 py-2.5 text-right">Imposto cenário</th>
              <th className="px-4 py-2.5 text-right">
                % médio cenário
                <span className="block text-[10px] normal-case">
                  (para precificação)
                </span>
              </th>
              <th className="px-4 py-2.5 text-right">Economia</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--muted-foreground)]"
                >
                  {rows.length === 0
                    ? "Sem dados para o filtro selecionado."
                    : itemListSearchEmptyMessage(query, "item")}
                </td>
              </tr>
            ) : (
              filtered.flatMap((row) => {
                const isExpanded = expandable && expandedKey === row.key;
                const mainRow = (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-t border-[var(--border)] hover:bg-[var(--muted)]/20",
                      expandable && "cursor-pointer",
                    )}
                    onClick={expandable ? () => toggleExpand(row.key) : undefined}
                  >
                    <td className="px-4 py-2.5 font-medium">
                      <span className="inline-flex items-center gap-1">
                        {expandable ? (
                          isExpanded ? (
                            <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                          )
                        ) : null}
                        {row.key}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatFinancialMoney(row.atual)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatFinancialPercent(row.atualPercent)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatFinancialMoney(row.cenario)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatFinancialPercent(row.cenarioPercent)}{" "}
                      <PercentPointsDelta
                        atualPercent={row.atualPercent}
                        cenarioPercent={row.cenarioPercent}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums font-medium",
                        row.economia > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : row.economia < 0
                            ? "text-red-600 dark:text-red-400"
                            : undefined,
                      )}
                    >
                      {formatFinancialMoney(row.economia)}{" "}
                      <span className="text-xs text-[var(--muted-foreground)]">
                        ({formatFinancialPercent(row.economiaPercent)})
                      </span>
                    </td>
                  </tr>
                );
                return isExpanded
                  ? [
                      mainRow,
                      <MemoriaCalculoPanel
                        key={`${row.key}-memoria`}
                        row={row}
                        skuUfRows={(skuUfRows ?? []).filter((r) => r.sku === row.key)}
                        incentivoInterpretacao={incentivoInterpretacao}
                      />,
                    ]
                  : [mainRow];
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TopMoversCard({
  title,
  rows,
  positive,
  onSelect,
}: {
  title: string;
  rows: SimulationRow[];
  positive?: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => onSelect(row.key)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-[var(--muted)]/30"
            >
              <span className="truncate">{row.key}</span>
              <span
                className={cn(
                  "shrink-0 tabular-nums font-medium",
                  positive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {formatFinancialMoney(row.economia)} (
                {formatFinancialPercent(row.economiaPercent)})
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type SupplierUfConfigProps = {
  open: boolean;
  loading: boolean;
  fornecedores: string[];
  supplierUfMap: Record<string, string>;
  onChangeUf: (fornecedor: string, uf: string) => void;
};

function SupplierUfConfig({
  open,
  loading,
  fornecedores,
  supplierUfMap,
  onChangeUf,
}: SupplierUfConfigProps) {
  if (!open) return null;

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <Truck className="size-4 text-[var(--muted-foreground)]" aria-hidden />
        <h3 className="text-sm font-semibold">UF dos fornecedores</h3>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
        Fornecedor identificado pelo prefixo do SKU (ex.: "MXT-123" →
        fornecedor "MXT"), mesma lógica usada em Compras. Informe a UF de cada
        um pra refinar o ICMS de entrada no cenário — só afeta produtos sem
        ICMS-ST, e só o cenário (o "atual" não muda). Salvo neste navegador.
      </p>
      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Carregando produtos…</p>
      ) : fornecedores.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nenhum produto cadastrado em Meus produtos ainda.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fornecedores.map((fornecedor) => (
            <FormSelect
              key={fornecedor}
              id={`supplier-uf-${fornecedor}`}
              label={fornecedor}
              value={supplierUfMap[fornecedor] ?? ""}
              onValueChange={(value) => onChangeUf(fornecedor, value)}
              options={[
                { value: "", label: "Não informado" },
                ...BRAZILIAN_UF_OPTIONS,
              ]}
              triggerClassName="w-full"
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export function BranchSimulationClient() {
  const skuTableRef = useRef<HTMLDivElement>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [supportedUfs, setSupportedUfs] = useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [targetUf, setTargetUf] = useState("SC");
  const [creditoPresumidoByUf, setCreditoPresumidoByUf] = useState<
    Record<string, number>
  >(() => ({ ...INCENTIVE_UF_DEFAULTS }));
  const creditoPresumidoPercent: number | null = creditoForUf(
    creditoPresumidoByUf,
    targetUf,
  );
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [supplierUfMap, setSupplierUfMap] = useState<Record<string, string>>({});
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const [showSupplierConfig, setShowSupplierConfig] = useState(false);
  const [loadingFornecedores, setLoadingFornecedores] = useState(false);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [compareSelection, setCompareSelection] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonEntry[] | null>(
    null,
  );

  useEffect(() => {
    setScenarios(loadScenarios());
    setSupplierUfMap(loadSupplierUfMap());
    setCreditoPresumidoByUf(loadCreditoPresumidoByUf());
  }, []);

  const updateCreditoForUf = useCallback((uf: string, value: number | null) => {
    const percent = value == null || !Number.isFinite(value) || value < 0 ? 0 : value;
    setCreditoPresumidoByUf((current) => {
      const next = { ...current, [uf]: percent };
      saveCreditoPresumidoByUf(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPeriods(true);
      try {
        const res = await fetch("/api/tax-report/branch-simulation");
        if (!res.ok) throw new Error(await readApiError(res, "periods_load"));
        const json = (await res.json()) as {
          periods: Period[];
          supportedUfs: string[];
        };
        if (cancelled) return;
        setPeriods(json.periods);
        setSupportedUfs(json.supportedUfs);
        setSelectedPeriods(new Set(json.periods.map(periodKey)));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar períodos");
        }
      } finally {
        if (!cancelled) setLoadingPeriods(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePeriod = (key: string) => {
    setSelectedPeriods((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runSimulation = useCallback(
    async (
      overridePeriods?: { year: number; month: number }[],
      overrideUf?: string,
      overrideCredito?: number,
    ) => {
      const chosenPeriods =
        overridePeriods ??
        periods
          .filter((p) => selectedPeriods.has(periodKey(p)))
          .map((p) => ({ year: p.year, month: p.month }));

      if (chosenPeriods.length === 0) {
        setError("Selecione ao menos um período.");
        return;
      }

      setSimulating(true);
      setError(null);
      try {
        const res = await fetch("/api/tax-report/branch-simulation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periods: chosenPeriods,
            targetUf: overrideUf ?? targetUf,
            creditoPresumidoPercent: overrideCredito ?? creditoPresumidoPercent ?? 0,
            supplierUfByFornecedor: supplierUfMap,
          }),
        });
        if (!res.ok) throw new Error(await readApiError(res, "simulation_failed"));
        const json = (await res.json()) as { result: SimulationResult };
        setResult(json.result);
        setExpandedSku(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao simular");
      } finally {
        setSimulating(false);
      }
    },
    [periods, selectedPeriods, targetUf, creditoPresumidoPercent, supplierUfMap],
  );

  const toggleCompareUf = (uf: string) => {
    setCompareSelection((current) => {
      const next = new Set(current);
      if (next.has(uf)) next.delete(uf);
      else next.add(uf);
      return next;
    });
  };

  const handleCompare = useCallback(async () => {
    const chosenPeriods = periods
      .filter((p) => selectedPeriods.has(periodKey(p)))
      .map((p) => ({ year: p.year, month: p.month }));

    if (chosenPeriods.length === 0) {
      setError("Selecione ao menos um período.");
      return;
    }
    if (compareSelection.size === 0) {
      setError("Selecione ao menos uma UF pra comparar.");
      return;
    }

    setComparing(true);
    setError(null);
    try {
      const compareUfs = [...compareSelection].map((uf) => ({
        uf,
        creditoPresumidoPercent: creditoForUf(creditoPresumidoByUf, uf),
      }));
      const res = await fetch("/api/tax-report/branch-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periods: chosenPeriods,
          targetUf,
          creditoPresumidoPercent: creditoPresumidoPercent ?? 0,
          supplierUfByFornecedor: supplierUfMap,
          compareUfs,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "compare_failed"));
      const json = (await res.json()) as {
        result: SimulationResult;
        comparison: ComparisonEntry[];
      };
      setResult(json.result);
      setExpandedSku(null);
      setComparisonResult(
        [...json.comparison].sort((a, b) => b.totais.economia - a.totais.economia),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao comparar estados");
    } finally {
      setComparing(false);
    }
  }, [
    periods,
    selectedPeriods,
    compareSelection,
    creditoPresumidoByUf,
    targetUf,
    creditoPresumidoPercent,
    supplierUfMap,
  ]);

  const handleUseComparisonUf = async (entry: ComparisonEntry) => {
    setTargetUf(entry.uf);
    updateCreditoForUf(entry.uf, entry.creditoPresumidoPercent);
    await runSimulation(undefined, entry.uf, entry.creditoPresumidoPercent);
    skuTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleToggleSupplierConfig = useCallback(async () => {
    setShowSupplierConfig((current) => !current);
    if (fornecedores.length > 0) return;

    setLoadingFornecedores(true);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error(await readApiError(res, "products_load"));
      const json = (await res.json()) as { products: { sku: string }[] };
      const distinct = new Set(
        json.products.map((p) => getSkuSupplier(p.sku)),
      );
      for (const key of Object.keys(loadSupplierUfMap())) distinct.add(key);
      setFornecedores([...distinct].sort((a, b) => a.localeCompare(b, "pt-BR")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar fornecedores");
    } finally {
      setLoadingFornecedores(false);
    }
  }, [fornecedores]);

  const handleChangeSupplierUf = (fornecedor: string, uf: string) => {
    setSupplierUfMap((current) => {
      const next = { ...current };
      if (uf) next[fornecedor] = uf;
      else delete next[fornecedor];
      saveSupplierUfMap(next);
      return next;
    });
  };

  const handleSaveScenario = () => {
    const name = scenarioName.trim();
    if (!name) return;
    const chosenPeriods = periods
      .filter((p) => selectedPeriods.has(periodKey(p)))
      .map((p) => ({ year: p.year, month: p.month }));
    const next: SavedScenario = {
      id: crypto.randomUUID(),
      name,
      periods: chosenPeriods,
      targetUf,
      creditoPresumidoPercent: creditoPresumidoPercent ?? 0,
      savedAt: new Date().toISOString(),
    };
    const updated = [next, ...scenarios.filter((s) => s.name !== name)];
    setScenarios(updated);
    saveScenarios(updated);
    setScenarioName("");
  };

  const handleLoadScenario = (scenario: SavedScenario) => {
    setSelectedPeriods(new Set(scenario.periods.map(periodKey)));
    setTargetUf(scenario.targetUf);
    updateCreditoForUf(scenario.targetUf, scenario.creditoPresumidoPercent);
    void runSimulation(scenario.periods, scenario.targetUf, scenario.creditoPresumidoPercent);
  };

  const handleDeleteScenario = (id: string) => {
    const updated = scenarios.filter((s) => s.id !== id);
    setScenarios(updated);
    saveScenarios(updated);
  };

  const ufOptions = (supportedUfs.length > 0 ? supportedUfs : ["SC"]).map((uf) => ({
    value: uf,
    label: uf,
  }));

  const topGains = useMemo(() => {
    if (!result) return [];
    return [...result.porSku]
      .filter((row) => row.economia > 0)
      .sort((a, b) => b.economia - a.economia)
      .slice(0, 5);
  }, [result]);

  const topLosses = useMemo(() => {
    if (!result) return [];
    return [...result.porSku]
      .filter((row) => row.economia < 0)
      .sort((a, b) => a.economia - b.economia)
      .slice(0, 5);
  }, [result]);

  return (
    <div className="space-y-5">
      <Card className="border-amber-200 bg-amber-50/60 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        Estimativa sobre as vendas já apuradas nos relatórios tributários
        selecionados. O % de carga efetiva ICMS origem deve ser validado com sua
        contabilidade e a legislação do estado escolhido. Não considera custo
        de transferência de estoque entre filiais nem obrigações acessórias
        da nova filial (inscrição estadual, folha, aluguel etc). O "% médio"
        por produto é o mesmo indicador usado como "Imposto" em Meus produtos
        e Lucratividade — dá pra ver o quanto a margem de precificação
        melhoraria em cada SKU se a filial saísse do papel.
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50/70 p-4 text-sm text-red-800">
          {error}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Parâmetros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-1">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Meses considerados
              </p>
              <PlanningInfoTrigger content={PERIODS_INFO_TEXT} />
            </div>
            {loadingPeriods ? (
              <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>
            ) : periods.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Nenhum relatório tributário gerado ainda. Gere um relatório em
                Tributário antes de simular.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {periods.map((p) => {
                  const key = periodKey(p);
                  const checked = selectedPeriods.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePeriod(key)}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        checked
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/30",
                      )}
                    >
                      {periodLabel(p)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormSelect
              id="branch-sim-uf"
              label="UF alvo (nova filial)"
              value={targetUf}
              onValueChange={setTargetUf}
              options={ufOptions}
              triggerClassName="w-full"
            />
            <div className="flex items-end gap-1">
              <div className="flex-1">
                <MaskedPercentField
                  id="branch-sim-incentivo"
                  label="Carga efetiva ICMS origem (%)"
                  value={creditoPresumidoPercent}
                  onValueChange={(value) => updateCreditoForUf(targetUf, value)}
                />
              </div>
              <PlanningInfoTrigger content={INCENTIVE_REFERENCE_TEXT} className="mb-1" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={simulating || loadingPeriods}
              onClick={() => void runSimulation()}
            >
              {simulating ? "Simulando…" : "Simular"}
            </Button>
            <input
              type="text"
              placeholder="Nome do cenário para salvar"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm shadow-sm"
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!scenarioName.trim()}
              onClick={handleSaveScenario}
            >
              <Save className="size-4" aria-hidden />
              Salvar cenário
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => void handleToggleSupplierConfig()}
            >
              <Truck className="size-4" aria-hidden />
              {showSupplierConfig ? "Ocultar" : "Configurar"} UF dos fornecedores
            </Button>
          </div>

          {scenarios.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">
                Cenários salvos (neste navegador)
              </p>
              <div className="flex flex-wrap gap-2">
                {scenarios.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--border)] py-1 pl-3 pr-1.5 text-xs"
                  >
                    <button
                      type="button"
                      className="cursor-pointer font-medium hover:underline"
                      onClick={() => handleLoadScenario(s)}
                    >
                      {s.name} · {s.targetUf}
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir cenário ${s.name}`}
                      className="cursor-pointer rounded-full p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40 hover:text-red-600"
                      onClick={() => handleDeleteScenario(s.id)}
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <SupplierUfConfig
        open={showSupplierConfig}
        loading={loadingFornecedores}
        fornecedores={fornecedores}
        supplierUfMap={supplierUfMap}
        onChangeUf={handleChangeSupplierUf}
      />

      <Card className="p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">Comparar estados</h3>
          <PlanningInfoTrigger content="Roda a simulação pra várias UFs candidatas de uma vez, usando os mesmos meses selecionados acima, e mostra qual economiza mais. Cada UF tem sua própria carga efetiva de ICMS origem editável (pré-preenchida com a referência de mercado — ex. SC 1,4%)." />
        </div>
        <div className="mb-3 flex flex-wrap gap-3">
          {supportedUfs.map((uf) => {
            const checked = compareSelection.has(uf);
            return (
              <label
                key={uf}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
                  checked
                    ? "border-[var(--primary)] bg-[var(--primary)]/5"
                    : "border-[var(--border)]",
                )}
              >
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={checked}
                  onChange={() => toggleCompareUf(uf)}
                />
                <span className="font-medium">{uf}</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  disabled={!checked}
                  value={creditoForUf(creditoPresumidoByUf, uf)}
                  onChange={(e) =>
                    updateCreditoForUf(uf, Number(e.target.value))
                  }
                  className="w-14 rounded border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 text-xs tabular-nums disabled:opacity-50"
                />
                <span className="text-[var(--muted-foreground)]">%</span>
              </label>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={comparing || compareSelection.size === 0}
          onClick={() => void handleCompare()}
        >
          {comparing ? "Comparando…" : "Comparar"}
        </Button>

        {comparisonResult && comparisonResult.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="bg-[var(--muted)]/30 text-left text-xs text-[var(--muted-foreground)]">
                  <th className="px-3 py-2">UF</th>
                  <th className="px-3 py-2 text-right">Imposto atual</th>
                  <th className="px-3 py-2 text-right">Imposto cenário</th>
                  <th className="px-3 py-2 text-right">Economia</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {comparisonResult.map((entry, index) => (
                  <tr key={entry.uf} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-medium">
                      {entry.uf}
                      {index === 0 ? (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          Melhor opção
                        </span>
                      ) : null}
                      <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">
                        ({entry.creditoPresumidoPercent}% carga efetiva)
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatFinancialMoney(entry.totais.atual)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatFinancialMoney(entry.totais.cenario)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums font-medium",
                        entry.totais.economia > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : entry.totais.economia < 0
                            ? "text-red-600 dark:text-red-400"
                            : undefined,
                      )}
                    >
                      {formatFinancialMoney(entry.totais.economia)} (
                      {formatFinancialPercent(entry.totais.economiaPercent)})
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleUseComparisonUf(entry)}
                      >
                        Ver detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-[var(--muted-foreground)]">
                Imposto atual ({result.transacoesConsideradas} vendas)
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatFinancialMoney(result.totais.atual)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                % médio: {formatFinancialPercent(result.totais.atualPercent)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--muted-foreground)]">
                Imposto no cenário ({targetUf})
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatFinancialMoney(result.totais.cenario)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                % médio: {formatFinancialPercent(result.totais.cenarioPercent)}{" "}
                <PercentPointsDelta
                  atualPercent={result.totais.atualPercent}
                  cenarioPercent={result.totais.cenarioPercent}
                />
              </p>
              {result.totais.incentivoCenario.creditoPresumidoValor > 0 ? (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                  Crédito presumido simulado:{" "}
                  {formatFinancialMoney(
                    result.totais.incentivoCenario.creditoPresumidoValor,
                  )}{" "}
                  (carga efetiva alvo{" "}
                  {result.cargaEfetivaAlvoPercent.toFixed(2)}%)
                </p>
              ) : result.cargaEfetivaAlvoPercent > 0 ? (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Carga efetiva alvo {result.cargaEfetivaAlvoPercent.toFixed(2)}%
                  — sem crédito neste mix (só internas ou alvo ≥ alíquota)
                </p>
              ) : null}
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--muted-foreground)]">Economia estimada</p>
              <p
                className={cn(
                  "mt-1 text-xl font-semibold tabular-nums",
                  result.totais.economia > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : result.totais.economia < 0
                      ? "text-red-600 dark:text-red-400"
                      : undefined,
                )}
              >
                {formatFinancialMoney(result.totais.economia)} (
                {formatFinancialPercent(result.totais.economiaPercent)})
              </p>
            </Card>
          </div>

          {topGains.length > 0 || topLosses.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {topGains.length > 0 ? (
                <TopMoversCard
                  title="Top 5 economia"
                  rows={topGains}
                  positive
                  onSelect={setExpandedSku}
                />
              ) : null}
              {topLosses.length > 0 ? (
                <TopMoversCard
                  title="Top 5 piora"
                  rows={topLosses}
                  onSelect={setExpandedSku}
                />
              ) : null}
            </div>
          ) : null}

          <div ref={skuTableRef}>
            <ResultTable
              title="Por produto (SKU)"
              infoText={SKU_TABLE_INFO_TEXT}
              rows={result.porSku}
              keyLabel="SKU"
              searchable
              expandable
              expandedKey={expandedSku}
              onToggleExpand={(key) =>
                setExpandedSku((current) => (current === key ? null : key))
              }
              skuUfRows={result.porSkuUf}
              incentivoInterpretacao={result.incentivoInterpretacao}
            />
          </div>
          <ResultTable
            title="Por UF de destino"
            infoText={UF_TABLE_INFO_TEXT}
            rows={result.porUf}
            keyLabel="UF"
          />
        </>
      ) : null}
    </div>
  );
}
