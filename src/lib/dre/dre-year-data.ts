import {
  applyDreIncludeCancelledView,
  computeDreTotals,
  sumYearLineAmounts,
  type DreCancelledIncludeOverlay,
  type DreComputedTotals,
  type DreEditableLineKey,
  type DreKeptFromPrevious,
  type DreLineAmounts,
  type DreLineAuditMismatch,
  type DreLineBreakdownItem,
  type DreMonthSnapshotPayload,
  LEAN_SNAPSHOT_PAYLOAD_KEYS,
  type DreProductCostBreakdownItem,
  type DreTaxBreakdownItem,
  type DreTaxSource,
} from "@/lib/dre/dre-calculations";
import {
  detectZeroLineAnomalies,
  type DreZeroLineAnomaly,
} from "@/lib/dre/dre-line-anomalies";
import {
  taxReportStaleness,
  type TaxReportStalenessReason,
} from "@/lib/tax-report/tax-report-staleness";
import { prisma } from "@/lib/db/db";
import {
  parseSnapshotPayload,
  snapshotPayloadToLines,
} from "@/lib/dre/dre-month-data";
import {
  buildExplicitFixedCostMap,
  explicitFixedCostOverride,
  resolveEffectiveFixedCostsForYear,
} from "@/lib/dre/dre-fixed-costs";
import {
  listFullShipmentActivityMonthsForYear,
  listImportedBillingPeriods,
} from "@/lib/envios-full/full-shipment-data";
import {
  formatDreMonthLabel,
  isCurrentCalendarMonth,
  isDreMonthSyncable,
  isFutureCalendarMonth,
} from "@/lib/mercadolibre/revenue-periods";

export type DreCostItemView = {
  id: string;
  name: string;
  sortOrder: number;
  recurring: boolean;
};

export type DreMonthView = {
  month: number;
  label: string;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  canSync: boolean;
  syncedAt: string | null;
  billingSource: DreMonthSnapshotPayload["billingSource"] | null;
  isPartial: boolean;
  incompleteProductCostCount: number;
  syncWarnings: string[];
  lines: DreLineAmounts | null;
  cancelledIncludeOverlay: DreCancelledIncludeOverlay | null;
  productCostBreakdown: DreProductCostBreakdownItem[] | null;
  taxBreakdown: DreTaxBreakdownItem[] | null;
  revenueBreakdown: DreLineBreakdownItem[] | null;
  cancelledSalesBreakdown: DreLineBreakdownItem[] | null;
  saleFeeBreakdown: DreLineBreakdownItem[] | null;
  sellerShippingBreakdown: DreLineBreakdownItem[] | null;
  adsCostBreakdown: DreLineBreakdownItem[] | null;
  partialReturnsBreakdown: DreLineBreakdownItem[] | null;
  returnFeeBreakdown: DreLineBreakdownItem[] | null;
  specialFeesBreakdown: DreLineBreakdownItem[] | null;
  fullShippingBreakdown: DreLineBreakdownItem[] | null;
  fullStorageBreakdown: DreLineBreakdownItem[] | null;
  fullNonComplianceBreakdown: DreLineBreakdownItem[] | null;
  minhaPaginaBreakdown: DreLineBreakdownItem[] | null;
  affiliateFeeBreakdown: DreLineBreakdownItem[] | null;
  /** Conciliação com a planilha Por Vendas (ver `resolveMonthReconciliation`). */
  reconciliation: DreMonthReconciliationView;
  /**
   * true quando algum nivelamento de custo que cobre o mês foi criado/editado
   * depois da última sync — o Custo produto do snapshot está desatualizado.
   */
  levelingChangedAfterSync: boolean;
  /** Imposto × relatório tributário do mês (ver `resolveMonthTaxStatus`). null = mês sem dados ou Home. */
  taxStatus: DreMonthTaxStatus | null;
  /** Versão do relatório tributário que o imposto usou (conta de conferência). */
  taxSource: DreTaxSource | null;
  /** Linhas zeradas fora do padrão dos outros meses — provável falha da API do ML. */
  zeroLineAnomalies: DreZeroLineAnomaly[];
  /** Linhas cuja fonte falhou no último sync e que mantiveram o valor anterior. */
  keptFromPrevious: DreKeptFromPrevious | null;
  /** Linhas que não batem com a soma da própria auditoria. */
  lineAuditMismatches: DreLineAuditMismatch[];
  /**
   * true quando o Relatório Full já tem envios para o mês (import ML ou
   * manual) — usado só para o alerta de UI; o valor na célula ainda vem do
   * snapshot até a próxima sync do DRE.
   */
  fullReportSourced: boolean;
  adsCost: number | null;
  /** Linhas ML/ERP/ADS ajustadas manualmente após o último sync. */
  manuallyEditedLineKeys: DreEditableLineKey[];
  /** Baseline do sync disponível para restaurar (chaves presentes). */
  syncedLineBaselineKeys: DreEditableLineKey[];
  fixedCostValues: Record<string, number | null>;
  fixedCostOverrides: Record<string, number | null>;
  operationalCostValues: Record<string, number | null>;
  operationalCostOverrides: Record<string, number | null>;
  investmentCostValues: Record<string, number | null>;
  investmentCostOverrides: Record<string, number | null>;
  nonOperationalOutValues: Record<string, number | null>;
  nonOperationalOutOverrides: Record<string, number | null>;
  nonOperationalInValues: Record<string, number | null>;
  nonOperationalInOverrides: Record<string, number | null>;
  totals: DreComputedTotals | null;
};

export type DreMonthReconciliationStatus = "reconciled" | "review" | "none";

export type DreMonthReconciliationView = {
  status: DreMonthReconciliationStatus;
  reconciledAt: string | null;
  fileName: string | null;
  lineKeys: DreEditableLineKey[];
  /** Import salvo pelo fluxo antigo que precisa de revisão (status `review`). */
  reviewImportId: string | null;
};

export type DreReconciliationImportSummary = {
  id: string;
  month: number;
  status: "pending" | "confirmed" | "superseded";
  appliedAt: Date | null;
  fileName: string;
};

/**
 * Status de conciliação do mês:
 * - `reconciled`: o snapshot tem `payload.reconciliation` (o sync reaplica);
 * - `review`: sobrou estado do fluxo antigo — `pending` aplicado e nunca salvo,
 *   ou `confirmed` sem a marca no snapshot (conciliação que um sync antigo
 *   apagou). Não dá pra afirmar que o mês está conciliado sem o usuário revisar;
 * - `none`: nada.
 */
export function resolveMonthReconciliation(
  payload: Pick<DreMonthSnapshotPayload, "reconciliation"> | null,
  monthImports: readonly DreReconciliationImportSummary[],
): DreMonthReconciliationView {
  const marker = payload?.reconciliation ?? null;
  const legacyPending = monthImports.find(
    (row) => row.status === "pending" && row.appliedAt !== null,
  );
  const confirmed = monthImports.find((row) => row.status === "confirmed");
  const reviewRow =
    legacyPending ??
    (confirmed && marker?.importId !== confirmed.id ? confirmed : undefined);

  if (reviewRow) {
    return {
      status: "review",
      reconciledAt: null,
      fileName: reviewRow.fileName,
      lineKeys: [],
      reviewImportId: reviewRow.id,
    };
  }
  if (marker) {
    return {
      status: "reconciled",
      reconciledAt: marker.reconciledAt || null,
      fileName: marker.fileName || null,
      lineKeys: marker.lineKeys,
      reviewImportId: null,
    };
  }
  return {
    status: "none",
    reconciledAt: null,
    fileName: null,
    lineKeys: [],
    reviewImportId: null,
  };
}

export type DreLevelingChangeSummary = {
  startDate: Date;
  endDate: Date;
  updatedAt: Date;
};

/** Algum nivelamento que cobre o mês mudou depois da última sync do mês. */
export function levelingChangedAfterSync(
  levelings: readonly DreLevelingChangeSummary[],
  year: number,
  month: number,
  syncedAt: Date | null,
): boolean {
  if (!syncedAt) return false;
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEnd = Date.UTC(year, month, 0);
  return levelings.some(
    (row) =>
      row.startDate.getTime() <= monthEnd &&
      row.endDate.getTime() >= monthStart &&
      row.updatedAt.getTime() > syncedAt.getTime(),
  );
}

/** Relatório tributário do mês como está no banco agora. */
export type DreTaxReportMeta = {
  /** Versão (`generatedAt`). */
  generatedAt: string;
  /** Quando os pedidos foram buscados no ML. */
  ordersFetchedAt: string;
  /** Versão antiga do cálculo (sem identidade do anúncio). */
  legacy: boolean;
};

/**
 * - `ok`: o DRE usou a versão atual de um relatório que cobre o mês inteiro;
 * - `partial`: mês em andamento — só informativo;
 * - `dre_outdated`: o relatório mudou depois → "Atualizar imposto" (só banco);
 * - `report_outdated`: o relatório precisa ser recalculado (`reasons`);
 * - `report_missing`: mês sem relatório tributário → imposto 0 ou % de outro mês;
 * - `simples`: empresa no Simples, % da alíquota efetiva do DAS.
 */
export type DreMonthTaxStatusKind =
  | "ok"
  | "partial"
  | "dre_outdated"
  | "report_outdated"
  | "report_missing"
  | "simples";

export type DreMonthTaxStatus = {
  kind: DreMonthTaxStatusKind;
  report: DreTaxReportMeta | null;
  reasons: TaxReportStalenessReason[];
  /** O mês tem auditoria por anúncio salva — dá para atualizar sem sync. */
  canRefresh: boolean;
};

export function resolveMonthTaxStatus(input: {
  year: number;
  month: number;
  hasSnapshot: boolean;
  regime: "LUCRO_REAL" | "SIMPLES";
  taxSource: Pick<DreTaxSource, "report"> | null;
  hasTaxBreakdown: boolean;
  report: DreTaxReportMeta | null;
  levelingUpdatedAt: Date | null;
  now?: Date;
}): DreMonthTaxStatus | null {
  if (!input.hasSnapshot) return null;
  const canRefresh = input.hasTaxBreakdown;
  if (input.regime === "SIMPLES") {
    return { kind: "simples", report: null, reasons: [], canRefresh };
  }
  if (!input.report) {
    return { kind: "report_missing", report: null, reasons: [], canRefresh };
  }
  const staleness = taxReportStaleness({
    year: input.year,
    month: input.month,
    ordersFetchedAt: input.report.ordersFetchedAt,
    generatedAt: input.report.generatedAt,
    legacy: input.report.legacy,
    levelingUpdatedAt: input.levelingUpdatedAt,
    now: input.now,
  });
  if (staleness.reasons.length > 0) {
    return {
      kind: "report_outdated",
      report: input.report,
      reasons: staleness.reasons,
      canRefresh,
    };
  }
  const used = input.taxSource?.report?.generatedAt;
  const sameVersion =
    used !== undefined &&
    Date.parse(used) === Date.parse(input.report.generatedAt);
  if (!sameVersion) {
    return { kind: "dre_outdated", report: input.report, reasons: [], canRefresh };
  }
  return {
    kind: staleness.completeness === "partial" ? "partial" : "ok",
    report: input.report,
    reasons: [],
    canRefresh,
  };
}

/** Último `updatedAt` dos nivelamentos que cobrem o mês. */
function levelingUpdatedAtForMonth(
  levelings: readonly DreLevelingChangeSummary[],
  year: number,
  month: number,
): Date | null {
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEnd = Date.UTC(year, month, 0);
  let latest: Date | null = null;
  for (const row of levelings) {
    if (
      row.startDate.getTime() <= monthEnd &&
      row.endDate.getTime() >= monthStart &&
      (!latest || row.updatedAt.getTime() > latest.getTime())
    ) {
      latest = row.updatedAt;
    }
  }
  return latest;
}

/**
 * Metadados do relatório tributário de cada mês do ano — sem trafegar o
 * resumo inteiro: só a versão, quando os pedidos foram buscados e se é da
 * versão antiga do cálculo. Mais de uma conta ML na organização: vale o mais
 * recente do mês.
 */
async function loadTaxReportMetaForYear(
  organizationId: string,
  year: number,
): Promise<Map<number, DreTaxReportMeta>> {
  // `$queryRaw*` NÃO passa pelo tenant guard: o filtro por organization_id é
  // obrigatório aqui.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      month: number;
      generatedAt: Date;
      ordersFetchedAt: string | null;
      geradoEm: string | null;
      legacy: boolean | null;
    }>
  >(
    `select month, generated_at as "generatedAt",
            payload_summary->'meta'->>'pedidosBuscadosEm' as "ordersFetchedAt",
            payload_summary->'meta'->>'geradoEm' as "geradoEm",
            (payload_summary is null
              or payload_summary->'consolidado'->'apuracao' is null
              or jsonb_path_exists(payload_summary, '$.porSku[*] ? (!(exists(@.mlItemId)))')) as legacy
     from tax_report_month_snapshots
     where organization_id = $1 and year = $2
     order by generated_at desc`,
    organizationId,
    year,
  );
  const byMonth = new Map<number, DreTaxReportMeta>();
  for (const row of rows) {
    if (byMonth.has(row.month)) continue;
    const generatedAt = row.generatedAt.toISOString();
    byMonth.set(row.month, {
      generatedAt,
      ordersFetchedAt: row.ordersFetchedAt ?? row.geradoEm ?? generatedAt,
      legacy: Boolean(row.legacy),
    });
  }
  return byMonth;
}

export type DreYearView = {
  year: number;
  costItems: DreCostItemView[];
  operationalCostItems: DreCostItemView[];
  investmentCostItems: DreCostItemView[];
  nonOperationalOutItems: DreCostItemView[];
  nonOperationalInItems: DreCostItemView[];
  months: DreMonthView[];
  yearTotals: DreComputedTotals | null;
};


export function buildMonthTotals(
  payload: DreMonthSnapshotPayload | null,
  lines: DreLineAmounts | null,
  fixedCostItems: DreCostItemView[],
  operationalCostItems: DreCostItemView[],
  investmentCostItems: DreCostItemView[],
  nonOperationalOutItems: DreCostItemView[],
  nonOperationalInItems: DreCostItemView[],
  fixedCostValues: Record<string, number | null>,
  operationalCostValues: Record<string, number | null>,
  investmentCostValues: Record<string, number | null>,
  nonOperationalOutValues: Record<string, number | null>,
  nonOperationalInValues: Record<string, number | null>,
): DreComputedTotals | null {
  const fixed = fixedCostItems.map((item) => ({
    costItemId: item.id,
    amount: fixedCostValues[item.id] ?? 0,
  }));
  const operational = operationalCostItems.map((item) => ({
    costItemId: item.id,
    amount: operationalCostValues[item.id] ?? 0,
  }));
  const investment = investmentCostItems.map((item) => ({
    costItemId: item.id,
    amount: investmentCostValues[item.id] ?? 0,
  }));
  const nonOperationalOut = nonOperationalOutItems.map((item) => ({
    costItemId: item.id,
    amount: nonOperationalOutValues[item.id] ?? 0,
  }));
  const nonOperationalIn = nonOperationalInItems.map((item) => ({
    costItemId: item.id,
    amount: nonOperationalInValues[item.id] ?? 0,
  }));

  if (!payload || !lines) {
    const manualOnly = [
      ...fixed,
      ...operational,
      ...investment,
      ...nonOperationalOut,
      ...nonOperationalIn,
    ].filter((row) => row.amount > 0);
    if (manualOnly.length === 0) return null;
    return computeDreTotals(
      {
        revenueMl: 0,
        cancelledSalesMl: 0,
        saleFeeMl: 0,
        partialReturnsMl: 0,
        returnFeeMl: 0,
        specialFeesMl: 0,
        productCostErp: 0,
        taxErp: 0,
        sellerShippingMl: 0,
        fullShippingMl: 0,
        fullStorageMl: 0,
        fullNonComplianceMl: 0,
        minhaPaginaMl: 0,
        affiliateFeeMl: 0,
      },
      0,
      fixed.filter((row) => row.amount > 0),
      operational.filter((row) => row.amount > 0),
      investment.filter((row) => row.amount > 0),
      nonOperationalOut.filter((row) => row.amount > 0),
      nonOperationalIn.filter((row) => row.amount > 0),
    );
  }

  return computeDreTotals(
    lines,
    payload.adsCost,
    fixed.filter((row) => row.amount > 0),
    operational.filter((row) => row.amount > 0),
    investment.filter((row) => row.amount > 0),
    nonOperationalOut.filter((row) => row.amount > 0),
    nonOperationalIn.filter((row) => row.amount > 0),
  );
}

export function buildEffectiveCostMaps(
  costItems: DreCostItemView[],
  year: number,
  explicitMap: Map<string, number>,
): {
  valuesByMonth: Record<number, Record<string, number | null>>;
  overridesByMonth: Record<number, Record<string, number | null>>;
} {
  const costItemIds = costItems.map((item) => item.id);
  const recurringByItemId = new Map(
    costItems.map((item) => [item.id, item.recurring] as const),
  );
  const effectiveByMonth = resolveEffectiveFixedCostsForYear(
    costItemIds,
    year,
    explicitMap,
    recurringByItemId,
  );

  const valuesByMonth: Record<number, Record<string, number | null>> = {};
  const overridesByMonth: Record<number, Record<string, number | null>> = {};

  for (let month = 1; month <= 12; month += 1) {
    valuesByMonth[month] = {};
    overridesByMonth[month] = {};
    for (const item of costItems) {
      overridesByMonth[month][item.id] = explicitFixedCostOverride(
        explicitMap,
        year,
        month,
        item.id,
      );
      valuesByMonth[month][item.id] =
        effectiveByMonth[month]?.[item.id] ?? null;
    }
  }

  return { valuesByMonth, overridesByMonth };
}

type DreSnapshotRow = {
  month: number;
  syncedAt: Date;
  payload: unknown;
};

export { LEAN_SNAPSHOT_PAYLOAD_KEYS };

/**
 * Snapshots do ano com o `payload` **projetado** nos campos de
 * `LEAN_SNAPSHOT_PAYLOAD_KEYS`.
 *
 * Por que existe: o payload completo de um mês passa de 300 KB em texto — o
 * `pg_column_size` engana, porque mostra o valor comprimido em disco, não o que
 * atravessa a rede. Ler o ano inteiro custava ~3 MB de egress por requisição:
 * tolerável numa tela aberta de vez em quando, caro demais na Home, que é
 * aberta toda hora.
 *
 * `parseSnapshotPayload` trata todo breakdown como opcional, então o payload
 * projetado atravessa o mesmo pipeline e produz **os mesmos totais** (há
 * verificação disso em `__tests__/dre-year-data-lean.test.ts`) — só não
 * alimenta os drill-downs de auditoria, que a Home não mostra.
 */
async function loadLeanDreSnapshots(
  organizationId: string,
  year: number,
): Promise<DreSnapshotRow[]> {
  // Os nomes vêm de `LEAN_SNAPSHOT_FIELDS` (constante do próprio módulo, não de
  // entrada do usuário); `organizationId`/`year` vão como parâmetros.
  const projection = LEAN_SNAPSHOT_PAYLOAD_KEYS.map(
    (key) => `'${key}', payload -> '${key}'`,
  ).join(", ");

  // `$queryRaw*` NÃO passa pelo tenant guard (ele cobre findMany/count/…), então
  // o filtro por organization_id aqui é obrigatório e não tem rede de proteção.
  return prisma.$queryRawUnsafe<DreSnapshotRow[]>(
    `select month, synced_at as "syncedAt",
            jsonb_build_object(${projection}) as payload
     from dre_month_snapshots
     where organization_id = $1 and year = $2`,
    organizationId,
    year,
  );
}

export async function loadDreYearView(
  organizationId: string,
  year: number,
  options?: {
    /**
     * Modo Home: duas economias de uma vez.
     *
     * 1. Lê os snapshots sem os arrays de breakdown (~390× menos egress).
     * 2. **Pula as leituras que só alimentam campo de auditoria**
     *    (`fullReportSourced`, revisão de conciliação, nivelamento alterado) —
     *    e duas delas são proporcionais ao volume: uma varre todo envio do
     *    ano, a outra todo envio `ml_billing` **sem limite de ano**. Na Home a
     *    conciliação sai só da marca no snapshot (`reconciled` ou `none`).
     *
     * O que a Home consome está em `HomeFinanceSlice`: 14 campos, nenhum
     * derivado dessas leituras — então quem garante que isto é seguro é o
     * compilador, não um teste. A tela do DRE precisa dos breakdowns e dos
     * campos de auditoria e **não** passa esta opção.
     */
    leanSnapshots?: boolean;
  },
): Promise<DreYearView> {
  const lean = options?.leanSnapshots === true;

  const [
    allCostItems,
    snapshots,
    monthValues,
    fullShipmentMonths,
    importedBillingPeriods,
    reconciliationImports,
    levelingChanges,
    taxReportMeta,
    taxSettings,
  ] = await Promise.all([
    prisma.dreCostItem.findMany({
      where: { organizationId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        sortOrder: true,
        section: true,
        recurring: true,
      },
    }),
    lean
      ? loadLeanDreSnapshots(organizationId, year)
      : prisma.dreMonthSnapshot.findMany({
          where: { organizationId, year },
        }),
    prisma.dreCostMonthValue.findMany({
      where: { organizationId, year: { in: [year, year - 1] } },
      select: { costItemId: true, year: true, month: true, amount: true },
    }),
    // As de baixo existem só para avisos da tela do DRE (`fullReportSourced`,
    // revisão de conciliação, nivelamento alterado). No modo Home elas nem
    // saem — ver o comentário da opção.
    lean
      ? Promise.resolve(new Set<number>())
      : listFullShipmentActivityMonthsForYear(organizationId, year),
    lean
      ? Promise.resolve<Array<{ year: number; month: number }>>([])
      : listImportedBillingPeriods(organizationId),
    lean
      ? Promise.resolve<DreReconciliationImportSummary[]>([])
      : prisma.dreReconciliationImport.findMany({
          // Prévias não aplicadas (`pending` sem `appliedAt`) são rascunho:
          // não contam para status nenhum.
          where: {
            organizationId,
            year,
            OR: [
              { status: "confirmed" },
              { status: "pending", appliedAt: { not: null } },
            ],
          },
          select: {
            id: true,
            month: true,
            status: true,
            appliedAt: true,
            fileName: true,
          },
        }),
    lean
      ? Promise.resolve<DreLevelingChangeSummary[]>([])
      : prisma.dreProductCostLeveling.findMany({
          where: {
            organizationId,
            startDate: { lte: new Date(Date.UTC(year, 11, 31)) },
            endDate: { gte: new Date(Date.UTC(year, 0, 1)) },
          },
          select: { startDate: true, endDate: true, updatedAt: true },
        }),
    lean
      ? Promise.resolve(new Map<number, DreTaxReportMeta>())
      : loadTaxReportMetaForYear(organizationId, year),
    lean
      ? Promise.resolve(null)
      : prisma.companyTaxSettings.findUnique({
          where: { organizationId },
          select: { taxRegime: true },
        }),
  ]);
  const taxRegime = taxSettings?.taxRegime === "SIMPLES" ? "SIMPLES" : "LUCRO_REAL";

  const reconciliationImportsByMonth = new Map<
    number,
    DreReconciliationImportSummary[]
  >();
  for (const row of reconciliationImports) {
    const list = reconciliationImportsByMonth.get(row.month) ?? [];
    list.push(row);
    reconciliationImportsByMonth.set(row.month, list);
  }

  const importedBillingMonths = new Set(
    importedBillingPeriods
      .filter((period) => period.year === year)
      .map((period) => period.month),
  );

  const costItems = allCostItems
    .filter((item) => item.section === "FIXED")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));
  const operationalCostItems = allCostItems
    .filter((item) => item.section === "OPERATIONAL")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));
  const investmentCostItems = allCostItems
    .filter((item) => item.section === "INVESTMENT")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));
  const nonOperationalOutItems = allCostItems
    .filter((item) => item.section === "NON_OPERATIONAL_OUT")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));
  const nonOperationalInItems = allCostItems
    .filter((item) => item.section === "NON_OPERATIONAL_IN")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));

  const snapshotByMonth = new Map(
    snapshots.map((row) => [row.month, row]),
  );

  const explicitMap = buildExplicitFixedCostMap(monthValues);
  const fixedMaps = buildEffectiveCostMaps(costItems, year, explicitMap);
  const operationalMaps = buildEffectiveCostMaps(
    operationalCostItems,
    year,
    explicitMap,
  );
  const investmentMaps = buildEffectiveCostMaps(
    investmentCostItems,
    year,
    explicitMap,
  );
  const nonOperationalOutMaps = buildEffectiveCostMaps(
    nonOperationalOutItems,
    year,
    explicitMap,
  );
  const nonOperationalInMaps = buildEffectiveCostMaps(
    nonOperationalInItems,
    year,
    explicitMap,
  );

  const months: DreMonthView[] = [];

  for (let month = 1; month <= 12; month += 1) {
    const snapshot = snapshotByMonth.get(month);
    const payload = snapshot
      ? parseSnapshotPayload(snapshot.payload)
      : null;

    const fixedCostValues = fixedMaps.valuesByMonth[month] ?? {};
    const fixedCostOverrides = fixedMaps.overridesByMonth[month] ?? {};
    const operationalCostValues = operationalMaps.valuesByMonth[month] ?? {};
    const operationalCostOverrides =
      operationalMaps.overridesByMonth[month] ?? {};
    const investmentCostValues = investmentMaps.valuesByMonth[month] ?? {};
    const investmentCostOverrides =
      investmentMaps.overridesByMonth[month] ?? {};
    const nonOperationalOutValues =
      nonOperationalOutMaps.valuesByMonth[month] ?? {};
    const nonOperationalOutOverrides =
      nonOperationalOutMaps.overridesByMonth[month] ?? {};
    const nonOperationalInValues =
      nonOperationalInMaps.valuesByMonth[month] ?? {};
    const nonOperationalInOverrides =
      nonOperationalInMaps.overridesByMonth[month] ?? {};

    const lines = payload
      ? applyDreIncludeCancelledView(
          snapshotPayloadToLines(payload),
          payload.cancelledIncludeOverlay,
        )
      : null;

    const totals = buildMonthTotals(
      payload,
      lines,
      costItems,
      operationalCostItems,
      investmentCostItems,
      nonOperationalOutItems,
      nonOperationalInItems,
      fixedCostValues,
      operationalCostValues,
      investmentCostValues,
      nonOperationalOutValues,
      nonOperationalInValues,
    );

    months.push({
      month,
      label: formatDreMonthLabel(month),
      isCurrentMonth: isCurrentCalendarMonth(year, month),
      isFutureMonth: isFutureCalendarMonth(year, month),
      canSync: isDreMonthSyncable(year, month),
      syncedAt: snapshot?.syncedAt.toISOString() ?? null,
      billingSource: payload?.billingSource ?? null,
      isPartial: payload?.isPartial ?? false,
      incompleteProductCostCount: payload?.incompleteProductCostCount ?? 0,
      syncWarnings: payload?.syncWarnings ?? [],
      lines,
      cancelledIncludeOverlay: payload?.cancelledIncludeOverlay ?? null,
      productCostBreakdown: payload?.productCostBreakdown ?? null,
      taxBreakdown: payload?.taxBreakdown ?? null,
      revenueBreakdown: payload?.revenueBreakdown ?? null,
      cancelledSalesBreakdown: payload?.cancelledSalesBreakdown ?? null,
      saleFeeBreakdown: payload?.saleFeeBreakdown ?? null,
      sellerShippingBreakdown: payload?.sellerShippingBreakdown ?? null,
      adsCostBreakdown: payload?.adsCostBreakdown ?? null,
      partialReturnsBreakdown: payload?.partialReturnsBreakdown ?? null,
      returnFeeBreakdown: payload?.returnFeeBreakdown ?? null,
      specialFeesBreakdown: payload?.specialFeesBreakdown ?? null,
      fullShippingBreakdown: payload?.fullShippingBreakdown ?? null,
      fullStorageBreakdown: payload?.fullStorageBreakdown ?? null,
      fullNonComplianceBreakdown: payload?.fullNonComplianceBreakdown ?? null,
      minhaPaginaBreakdown: payload?.minhaPaginaBreakdown ?? null,
      affiliateFeeBreakdown: payload?.affiliateFeeBreakdown ?? null,
      reconciliation: resolveMonthReconciliation(
        payload,
        reconciliationImportsByMonth.get(month) ?? [],
      ),
      levelingChangedAfterSync: levelingChangedAfterSync(
        levelingChanges,
        year,
        month,
        snapshot?.syncedAt ?? null,
      ),
      taxStatus: lean
        ? null
        : resolveMonthTaxStatus({
            year,
            month,
            hasSnapshot: Boolean(snapshot && payload),
            regime: taxRegime,
            taxSource: payload?.taxSource ?? null,
            hasTaxBreakdown: Boolean(payload?.taxBreakdown),
            report: taxReportMeta.get(month) ?? null,
            levelingUpdatedAt: levelingUpdatedAtForMonth(
              levelingChanges,
              year,
              month,
            ),
          }),
      taxSource: payload?.taxSource ?? null,
      // Preenchido depois do laço: compara com os outros meses do ano.
      zeroLineAnomalies: [],
      keptFromPrevious: payload?.keptFromPrevious ?? null,
      lineAuditMismatches: payload?.lineAuditMismatches ?? [],
      // Checagem ao vivo (não só o flag do snapshot): snapshots antigos não
      // tinham `fullReportSourced`, e importar depois da sync também conta.
      fullReportSourced:
        fullShipmentMonths.has(month) || importedBillingMonths.has(month),
      adsCost: payload?.adsCost ?? null,
      manuallyEditedLineKeys: payload?.manuallyEditedLineKeys ?? [],
      // Só considera o baseline se ele veio de um sync real — senão o
      // baseline "fantasma" semeado por `applyManualLineEdit` num snapshot
      // vazio faria o botão "Restaurar" reverter pro valor pré-edição (ex. 0)
      // em vez de um valor de sync de verdade.
      syncedLineBaselineKeys:
        payload?.hasRealSyncBaseline && payload.syncedLineBaseline
          ? (Object.keys(payload.syncedLineBaseline) as DreEditableLineKey[])
          : [],
      fixedCostValues,
      fixedCostOverrides,
      operationalCostValues,
      operationalCostOverrides,
      investmentCostValues,
      investmentCostOverrides,
      nonOperationalOutValues,
      nonOperationalOutOverrides,
      nonOperationalInValues,
      nonOperationalInOverrides,
      totals,
    });
  }

  const anomalies = detectZeroLineAnomalies(months);
  for (const row of months) {
    row.zeroLineAnomalies = anomalies.get(row.month) ?? [];
  }

  const yearTotals = buildYearTotals(
    months,
    costItems,
    operationalCostItems,
    investmentCostItems,
    nonOperationalOutItems,
    nonOperationalInItems,
  );

  return {
    year,
    costItems,
    operationalCostItems,
    investmentCostItems,
    nonOperationalOutItems,
    nonOperationalInItems,
    months,
    yearTotals,
  };
}

export function buildYearTotals(
  months: DreMonthView[],
  costItems: DreCostItemView[],
  operationalCostItems: DreCostItemView[],
  investmentCostItems: DreCostItemView[],
  nonOperationalOutItems: DreCostItemView[],
  nonOperationalInItems: DreCostItemView[],
): DreComputedTotals | null {
  const monthLines = months
    .map((month) => month.lines)
    .filter((lines): lines is DreLineAmounts => lines !== null);

  const yearLines =
    monthLines.length > 0 ? sumYearLineAmounts(monthLines) : null;

  const yearAds = months.reduce((sum, month) => sum + (month.adsCost ?? 0), 0);

  const yearFixedByItem = new Map<string, number>();
  for (const item of costItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.fixedCostValues[item.id] ?? 0;
    }
    yearFixedByItem.set(item.id, sum);
  }

  const yearOperationalByItem = new Map<string, number>();
  for (const item of operationalCostItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.operationalCostValues[item.id] ?? 0;
    }
    yearOperationalByItem.set(item.id, sum);
  }

  const yearInvestmentByItem = new Map<string, number>();
  for (const item of investmentCostItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.investmentCostValues[item.id] ?? 0;
    }
    yearInvestmentByItem.set(item.id, sum);
  }

  const yearNonOperationalOutByItem = new Map<string, number>();
  for (const item of nonOperationalOutItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.nonOperationalOutValues[item.id] ?? 0;
    }
    yearNonOperationalOutByItem.set(item.id, sum);
  }

  const yearNonOperationalInByItem = new Map<string, number>();
  for (const item of nonOperationalInItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.nonOperationalInValues[item.id] ?? 0;
    }
    yearNonOperationalInByItem.set(item.id, sum);
  }

  const yearManualFixed = costItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearFixedByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearManualOperational = operationalCostItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearOperationalByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearManualInvestment = investmentCostItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearInvestmentByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearManualNonOperationalOut = nonOperationalOutItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearNonOperationalOutByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearManualNonOperationalIn = nonOperationalInItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearNonOperationalInByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  if (yearLines !== null) {
    return computeDreTotals(
      yearLines,
      yearAds,
      yearManualFixed,
      yearManualOperational,
      yearManualInvestment,
      yearManualNonOperationalOut,
      yearManualNonOperationalIn,
    );
  }

  if (
    yearManualFixed.length > 0 ||
    yearManualOperational.length > 0 ||
    yearManualInvestment.length > 0 ||
    yearManualNonOperationalOut.length > 0 ||
    yearManualNonOperationalIn.length > 0
  ) {
    return computeDreTotals(
      {
        revenueMl: 0,
        cancelledSalesMl: 0,
        saleFeeMl: 0,
        partialReturnsMl: 0,
        returnFeeMl: 0,
        specialFeesMl: 0,
        productCostErp: 0,
        taxErp: 0,
        sellerShippingMl: 0,
        fullShippingMl: 0,
        fullStorageMl: 0,
        fullNonComplianceMl: 0,
        minhaPaginaMl: 0,
        affiliateFeeMl: 0,
      },
      0,
      yearManualFixed,
      yearManualOperational,
      yearManualInvestment,
      yearManualNonOperationalOut,
      yearManualNonOperationalIn,
    );
  }

  return null;
}
