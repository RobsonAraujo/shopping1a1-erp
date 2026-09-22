import type { Metadata } from "next";
import { Camera, Snowflake } from "lucide-react";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserFeedback } from "@/components/ui/user-feedback";
import { getOrganizationContext } from "@/lib/organizations/context";
import { zonedLocalToUtc } from "@/lib/report-timezone";
import { reportsConfig } from "@/config/reports";
import {
  DEFAULT_STOCK_REPORT_COMPANY,
  MONTH_NAMES_PT,
} from "@/lib/inventory/inventory-stock-report";
import {
  buildInventoryMonthSnapshotListingInputs,
  listClosedInventorySnapshotMonths,
  loadInventoryMonthSnapshotEvolution,
  loadInventoryMonthSnapshotRows,
  type InventoryMonthSnapshotStatusSummary,
} from "@/lib/inventory/inventory-month-snapshot-report";
import { InventoryAutoCloseInfoTooltip } from "@/components/inventory/InventoryAutoCloseInfoTooltip";
import { InventoryHistoryMonthPicker } from "@/components/inventory/InventoryHistoryMonthPicker";
import { InventoryHistoryReportEditor } from "@/components/inventory/InventoryHistoryReportEditor";
import { InventoryManualSnapshotButton } from "@/components/inventory/InventoryManualSnapshotButton";

export const metadata: Metadata = {
  title: "Histórico de Estoque",
};

const EVOLUTION_MONTHS_LIMIT = 12;

function formatCompletedAt(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleString("pt-BR", {
    timeZone: reportsConfig.catalogCompetitionTimezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function InventoryHistoryMonthContent({
  organizationId,
  months,
  selected,
}: {
  organizationId: string;
  months: InventoryMonthSnapshotStatusSummary[];
  selected: InventoryMonthSnapshotStatusSummary;
}) {
  const snapshotRows = await loadInventoryMonthSnapshotRows(
    organizationId,
    selected.year,
    selected.month,
  );
  const { listings, productsBySku } =
    buildInventoryMonthSnapshotListingInputs(snapshotRows);

  const daysInMonth = new Date(selected.year, selected.month, 0).getDate();
  const referenceDate = zonedLocalToUtc(
    selected.year,
    selected.month,
    daysInMonth,
    23,
    59,
    59,
    999,
    reportsConfig.catalogCompetitionTimezone,
  );
  const header = {
    companyName: DEFAULT_STOCK_REPORT_COMPANY,
    subtitle: `Fechamento oficial de estoque — ${MONTH_NAMES_PT[selected.month - 1]} de ${selected.year}`,
  };

  // Meses fechados imediatamente ANTERIORES ao selecionado (não o próprio
  // mês selecionado — esse já aparece nas colunas "Unidades"/"Valor" atuais
  // da tabela principal, mostrar de novo seria redundante). `months` vem
  // mais recente primeiro; a tabela lê melhor em ordem cronológica
  // (mais antigo → mais recente), por isso inverte.
  const selectedIndex = months.findIndex(
    (m) => m.year === selected.year && m.month === selected.month,
  );
  const priorMonths = (
    selectedIndex === -1
      ? []
      : months.slice(
          selectedIndex + 1,
          selectedIndex + 1 + EVOLUTION_MONTHS_LIMIT,
        )
  )
    .slice()
    .reverse();
  const evolution = await loadInventoryMonthSnapshotEvolution(
    organizationId,
    priorMonths,
  );

  return (
    <InventoryHistoryReportEditor
      listings={listings}
      productsBySku={productsBySku}
      initialHeader={header}
      referenceDateIso={referenceDate.toISOString()}
      evolution={evolution}
    />
  );
}

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function InventoryHistoryPage({
  searchParams,
}: PageProps) {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }
  const organizationId = orgContext.organization.id;

  const months = await listClosedInventorySnapshotMonths(organizationId);

  const rawSearchParams = await searchParams;
  const requestedYear = rawSearchParams.year
    ? Number(rawSearchParams.year)
    : null;
  const requestedMonth = rawSearchParams.month
    ? Number(rawSearchParams.month)
    : null;
  const requested =
    requestedYear && requestedMonth
      ? months.find(
          (m) => m.year === requestedYear && m.month === requestedMonth,
        )
      : null;
  const selected = requested ?? months[0] ?? null;
  const selectedMonthLabel = selected
    ? `${MONTH_NAMES_PT[selected.month - 1]} de ${selected.year}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Breadcrumbs
            items={[
              { label: "Estoque", href: "/dashboard/inventory" },
              { label: "Histórico" },
            ]}
          />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Histórico de estoque
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Consulte o estoque congelado no fechamento de cada mês e exporte o
            relatório oficial.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <span>Fecha sozinho todo início de mês</span>
            <InventoryAutoCloseInfoTooltip />
          </div>
          <InventoryManualSnapshotButton size="sm" />
        </div>
      </div>

      {selected === null ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <Camera className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
            Nenhum mês fechado ainda
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
            O primeiro fechamento automático aparece aqui no início do próximo
            mês. Se precisar de um corte agora — por exemplo, para a
            contabilidade — gere um snapshot do estoque de hoje.
          </p>
          <div className="mt-6">
            <InventoryManualSnapshotButton variant="default" />
          </div>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden rounded-2xl p-0">
            <div className="border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-4 sm:px-5">
              <InventoryHistoryMonthPicker
                months={months}
                selected={selected}
              />
            </div>
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                    {selectedMonthLabel}
                  </p>
                  {selected.source === "manual" ? (
                    <Badge variant="warning" dot>
                      Snapshot manual
                    </Badge>
                  ) : (
                    <Badge variant="success" dot>
                      Fechamento oficial
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {selected.source === "manual" ? (
                    <>
                      Gerado em {formatCompletedAt(selected.completedAt)}. Será
                      substituído pelo fechamento automático quando este mês
                      fechar.
                    </>
                  ) : (
                    <>
                      Congelado em {formatCompletedAt(selected.completedAt)}
                      {selected.itemsSnapshotted > 0
                        ? ` · ${selected.itemsSnapshotted} anúncio${selected.itemsSnapshotted !== 1 ? "s" : ""}`
                        : null}
                    </>
                  )}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <Snowflake className="size-3.5" aria-hidden />
                Dados congelados, ajustes abaixo não alteram o snapshot
              </span>
            </div>
          </Card>

          {selected.source === "manual" ? (
            <UserFeedback
              tone="info"
              title="Este mês ainda é provisório"
              className="shadow-none"
            >
              Use o snapshot manual só como corte temporário. No início do mês
              seguinte o fechamento automático oficial toma o lugar dele.
            </UserFeedback>
          ) : null}

          <InventoryHistoryMonthContent
            organizationId={organizationId}
            months={months}
            selected={selected}
          />
        </>
      )}
    </div>
  );
}
