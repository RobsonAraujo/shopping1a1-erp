"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NumericFormat } from "react-number-format";
import { AlertCircle, ChevronLeft, ChevronRight, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import { DreProductCostAuditModal } from "@/components/dre/dre-product-cost-audit-modal";
import { DreTaxAuditModal } from "@/components/dre/dre-tax-audit-modal";
import { DreLineAuditModal } from "@/components/dre/dre-line-audit-modal";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import {
  getYearLineBreakdown,
  getYearProductCostBreakdown,
  getYearTaxBreakdown,
  isDreEditableLineKey,
  type DreEditableLineKey,
  type DreLineBreakdownItem,
} from "@/lib/dre/dre-calculations";
import {
  buildDreTableRows,
  dreMonthShortLabel,
  getCellValue,
  isColoredRow,
  rowBackgroundClass,
  rowLabelClass,
  valueToneClass,
  type DreStaticRowId,
  type DreTableRow,
} from "@/lib/dre/dre-table-rows";
import { reportsConfig } from "@/config/reports";
import {
  formatCalendarRangeYmd,
  getCalendarMonthRange,
} from "@/lib/mercadolibre/revenue-periods";
import { cn } from "@/lib/utils";

const PERCENT_ROW_DIVIDER_STYLE = {
  boxShadow:
    "inset 0 1px 0 0 rgba(255,255,255,0.3), inset 0 -1px 0 0 rgba(255,255,255,0.3)",
} as const;

/**
 * Border em <td> sticky dentro de tabela border-collapse não compõe de forma
 * confiável (bug de renderização do Chromium/Safari) — usamos box-shadow
 * inset por célula em vez de border no <tr>, aplicado a toda a linha para
 * manter o alinhamento entre a coluna sticky e as demais. Uma única variante
 * (linha inferior, translúcida) é usada em toda a tabela — sem uma borda
 * opaca especial antes das linhas de resultado, para não ficar inconsistente
 * ao lado das demais bordas translúcidas.
 */
const MAIN_ROW_DIVIDER_STYLE = {
  boxShadow: "inset 0 -1px 0 0 rgba(148, 163, 184, 0.35)",
} as const;

/** Zebra striping das linhas de detalhe (fundo branco/card) — só a cor #f4f2f7, sem borda extra. */
const ALT_ROW_BG = "#f4f2f7";

const SELECTED_MONTH_CELL_CLASS = "relative";

/**
 * Esmaece e desativa a interação das células que não estão em foco.
 * Usado ao destacar uma coluna de mês, e também na edição inline
 * (quando tudo fica esmaecido exceto a célula sendo editada).
 * `opacity` funciona de forma uniforme em cima de qualquer cor de fundo
 * (verde/vermelho/branco). `pointer-events-none` desliga ícones/botões
 * das áreas esmaecidas.
 */
const DIM_CLASS =
  "pointer-events-none opacity-40 transition-opacity duration-150";

type DreYearTableProps = {
  data: DreYearView;
  showDetails: boolean;
  onToggleDetails?: () => void;
  syncingMonths: Set<number>;
  onSyncMonth: (month: number) => void;
  onLineChange: (
    lineKey: DreEditableLineKey,
    month: number,
    amount: number,
  ) => void;
  onFixedCostChange: (
    costItemId: string,
    month: number,
    amount: number | null,
  ) => void;
  onOperationalCostChange: (
    costItemId: string,
    month: number,
    amount: number | null,
  ) => void;
  onInvestmentCostChange: (
    costItemId: string,
    month: number,
    amount: number | null,
  ) => void;
};

function formatSyncTime(iso: string | null): string {
  if (!iso) return "Nunca sincronizado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function getMonthAlertMessages(month: DreMonthView): string[] {
  const messages: string[] = [];

  if (month.isPartial) {
    messages.push(
      "Período parcial — mês em andamento ou custos ML ainda incompletos.",
    );
  }
  if (month.billingSource === "fallback" && month.syncedAt) {
    messages.push(
      "Custos ML estimados pelos pedidos (faturamento oficial indisponível ou incompleto).",
    );
  }
  messages.push(...month.syncWarnings);

  return messages;
}

function MonthAlertsTooltip({
  month,
  messages,
}: {
  month: DreMonthView;
  messages: string[];
}) {
  if (messages.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full p-1 text-amber-500/70 opacity-60 hover:opacity-100 hover:text-amber-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          aria-label={`Ver avisos de ${month.label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <AlertCircle className="size-2.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="center"
        className="max-w-[18rem] space-y-2 text-left"
      >
        <p className="font-semibold text-[var(--foreground)]">
          Avisos — {month.label}
        </p>
        <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
        <p className="border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted-foreground)]">
          Última sync: {formatSyncTime(month.syncedAt)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function FullReportMissingTooltip({
  month,
  colored,
}: {
  month: DreMonthView;
  colored: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-sm opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
            colored
              ? "text-white/80 hover:text-white"
              : "text-amber-500/80 hover:text-amber-600",
          )}
          aria-label={`Relatório Full não importado para ${month.label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="size-3" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        className="max-w-[18rem] space-y-1.5 text-left"
      >
        <p className="font-semibold text-[var(--foreground)]">
          Relatório Full pendente — {month.label}
        </p>
        <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
          Envios/inconformidade ainda não foram importados em Relatório Full.
          O valor atual vem da fatura consolidada (pode ser impreciso). Importe
          em Relatório Full e sincronize o mês no DRE para o valor mais
          confiável.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function MonthSyncTooltip({
  year,
  month,
  children,
}: {
  year: number;
  month: DreMonthView;
  children: ReactNode;
}) {
  const civilRange = getCalendarMonthRange(
    year,
    month.month,
    reportsConfig.catalogCompetitionTimezone,
  );
  const civilPeriod = formatCalendarRangeYmd(
    civilRange,
    reportsConfig.catalogCompetitionTimezone,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" align="center" className="text-left">
        <p className="font-medium">{month.label}</p>
        <p className="mt-1 text-[var(--muted-foreground)]">
          Período civil: {civilPeriod.from} → {civilPeriod.to}
        </p>
        <p className="mt-1 text-[var(--muted-foreground)]">
          Sync: {formatSyncTime(month.syncedAt)}
        </p>
        {month.isCurrentMonth ? (
          <p className="mt-1 text-[var(--muted-foreground)]">Mês atual</p>
        ) : null}
        {month.isFutureMonth ? (
          <p className="mt-1 text-[var(--muted-foreground)]">Mês futuro</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function sourceOriginLabel(source: string): string {
  switch (source) {
    case "ml":
      return "Mercado Livre";
    case "erp":
      return "ERP (nosso sistema)";
    case "ads":
      return "Campanhas ADS (Mercado Livre)";
    default:
      return "Valor manual";
  }
}

function DreInlineMoneyCell({
  displayAmount,
  label,
  allowNegative = true,
  disabled = false,
  muted = false,
  title,
  onCommit,
  onEditingChange,
  onAudit,
  leading,
  trailing,
}: {
  displayAmount: number | null;
  label: string;
  allowNegative?: boolean;
  disabled?: boolean;
  muted?: boolean;
  title?: string;
  onCommit: (amount: number | null) => void;
  /** Notifica o pai ao entrar/sair do modo de edição (para esmaecer o restante do DRE). */
  onEditingChange?: (editing: boolean) => void;
  /** Clique simples abre auditoria (atrasado para não conflitar com duplo-clique de edição). */
  onAudit?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(displayAmount);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedOnceRef = useRef(false);

  const EDITOR_MIN_WIDTH_PX = 260;
  const VIEWPORT_PAD_PX = 16;

  function placeEditorPanel() {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(
      Math.max(EDITOR_MIN_WIDTH_PX, rect.width),
      vw - VIEWPORT_PAD_PX * 2,
    );

    // Prefere alinhar à direita da célula; se não couber à esquerda (meses
    // iniciais / sticky), empurra para dentro da viewport.
    let left = rect.right - width;
    left = Math.max(
      VIEWPORT_PAD_PX,
      Math.min(left, vw - width - VIEWPORT_PAD_PX),
    );

    // Centro vertical da célula (painel via portal no body — fixed real).
    const halfH = 22;
    let top = rect.top + rect.height / 2;
    top = Math.max(
      VIEWPORT_PAD_PX + halfH,
      Math.min(top, vh - VIEWPORT_PAD_PX - halfH),
    );

    setPanelStyle({
      position: "fixed",
      left,
      top,
      width,
      transform: "translateY(-50%)",
      zIndex: 60,
    });
  }

  useEffect(() => {
    if (!editing) return;
    placeEditorPanel();
    // rAF: layout da célula de foco (z-index/dim) pode mudar no mesmo tick.
    const raf = requestAnimationFrame(() => placeEditorPanel());
    const onReposition = () => placeEditorPanel();
    window.addEventListener("resize", onReposition);
    // Captura scroll de qualquer container (tabela com overflow-x-auto).
    window.addEventListener("scroll", onReposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [editing]);

  useEffect(() => {
    if (!editing) {
      focusedOnceRef.current = false;
      return;
    }
    if (!panelStyle || focusedOnceRef.current) return;
    focusedOnceRef.current = true;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing, panelStyle]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  function clearClickTimer() {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }

  function startEditing() {
    if (disabled) return;
    clearClickTimer();
    setDraft(displayAmount);
    setEditing(true);
    onEditingChange?.(true);
  }

  function cancelEditing() {
    setDraft(displayAmount);
    setEditing(false);
    setPanelStyle(null);
    onEditingChange?.(false);
  }

  function commit(next: number | null) {
    setEditing(false);
    setPanelStyle(null);
    onEditingChange?.(false);
    const prev = displayAmount;
    const same =
      (next === null && prev === null) ||
      (next !== null && prev !== null && Math.abs(next - prev) < 0.000_001);
    if (!same) {
      onCommit(next);
    }
  }

  if (editing) {
    // Portal no body: a página do DRE usa `-translate-x-1/2`, o que faz
    // `position:fixed` interno ancorar nesse ancestral (e subir com o scroll).
    const editorPanel =
      panelStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              style={panelStyle}
              className="pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <div className="flex animate-in items-center justify-end gap-1 rounded-md border border-[var(--primary)]/40 bg-[var(--background)] p-1 shadow-lg ring-2 ring-[var(--primary)]/30 duration-300 fade-in-0">
                <NumericFormat
                  getInputRef={inputRef}
                  value={draft ?? ""}
                  onValueChange={(values) => {
                    setDraft(values.floatValue ?? null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditing();
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commit(draft);
                    }
                  }}
                  thousandSeparator="."
                  decimalSeparator=","
                  prefix="R$ "
                  decimalScale={2}
                  allowNegative={allowNegative}
                  aria-label={`Editar ${label}`}
                  className="h-8 min-w-0 flex-1 rounded border border-[var(--border)] bg-white px-2 py-1 text-right text-sm font-bold tabular-nums outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/40"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-[11px] font-semibold"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => cancelEditing()}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 shrink-0 px-2.5 text-[11px] font-semibold"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(draft)}
                >
                  Aplicar
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null;

    return (
      <div ref={anchorRef} className="relative h-8 w-full min-w-[4.5rem]">
        {/* Placeholder mantém a altura da célula enquanto o painel é portal. */}
        <span className="invisible whitespace-nowrap text-[12.5px] font-bold tabular-nums">
          {formatFinancialMoney(displayAmount)}
        </span>
        {editorPanel}
      </div>
    );
  }

  const defaultTitle = disabled
    ? onAudit
      ? `Clique para auditar ${label}`
      : undefined
    : onAudit
      ? `Clique para auditar · Duplo-clique para editar ${label}`
      : `Duplo-clique para editar ${label}`;

  return (
    <div className="inline-flex items-center justify-center gap-1.5">
      {leading}
      <span
        role={disabled && !onAudit ? undefined : "button"}
        tabIndex={disabled && !onAudit ? undefined : 0}
        className={cn(
          "whitespace-nowrap text-[12.5px] font-bold tabular-nums leading-tight",
          muted && "text-[var(--muted-foreground)]",
          (!disabled || onAudit) &&
            "cursor-pointer rounded-sm hover:bg-black/[0.04]",
          onAudit &&
            "underline decoration-dotted decoration-1 underline-offset-2",
        )}
        title={title ?? defaultTitle}
        onClick={(e) => {
          if (!onAudit) return;
          e.stopPropagation();
          clearClickTimer();
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null;
            onAudit();
          }, 280);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) {
            clearClickTimer();
            return;
          }
          startEditing();
        }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === "F2")) {
            e.preventDefault();
            startEditing();
            return;
          }
          if (disabled && onAudit && e.key === "Enter") {
            e.preventDefault();
            onAudit();
          }
        }}
      >
        {formatFinancialMoney(displayAmount)}
      </span>
      {trailing}
    </div>
  );
}

function getEditableLineKey(row: DreTableRow): DreEditableLineKey | null {
  if (row.type !== "static") return null;
  if (
    row.kind === "entrada-total" ||
    row.kind === "custo-total" ||
    row.kind === "resultado"
  ) {
    return null;
  }
  if (row.id === "adsCost") return "adsCost";
  if (row.lineKey && isDreEditableLineKey(row.lineKey)) {
    return row.lineKey;
  }
  return null;
}

type AuditKind =
  | "productCost"
  | "tax"
  | "revenue"
  | "cancelledSales"
  | "saleFee"
  | "sellerShipping"
  | "adsCost";
type AuditTarget = { kind: AuditKind; period: number | "year" } | null;

/** Linhas estáticas do DRE que abrem auditoria ao clicar no valor. */
const ROW_ID_TO_AUDIT_KIND: Partial<Record<DreStaticRowId, AuditKind>> = {
  productCostErp: "productCost",
  taxErp: "tax",
  revenueMl: "revenue",
  cancelledSalesMl: "cancelledSales",
  saleFeeMl: "saleFee",
  sellerShippingMl: "sellerShipping",
  adsCost: "adsCost",
};

function getAuditKindForRow(row: DreTableRow): AuditKind | null {
  return row.type === "static" ? (ROW_ID_TO_AUDIT_KIND[row.id] ?? null) : null;
}

/** Textos do modal de auditoria genérica, por tipo de linha (exceto Custo produto/Imposto ML, que têm modal próprio). */
const LINE_AUDIT_TEXT: Partial<
  Record<AuditKind, { rowLabel: string; amountLabel: string; description: string }>
> = {
  revenue: {
    rowLabel: "Faturamento ML",
    amountLabel: "Faturamento",
    description:
      "Soma do valor de venda de cada pedido pago no mês, por anúncio/SKU (inclui as vendas canceladas somadas de volta ao faturamento).",
  },
  cancelledSales: {
    rowLabel: "Canceladas ML",
    amountLabel: "Valor cancelado",
    description:
      "Soma do valor bruto de cada pedido cancelado no mês, por anúncio/SKU.",
  },
  saleFee: {
    rowLabel: "Tarifa ML",
    amountLabel: "Tarifa",
    description:
      "Tarifa de venda cobrada pelo Mercado Livre, por anúncio/SKU — disponível apenas quando estimada pelos pedidos (mês sem fatura consolidada alinhada ao período civil).",
  },
  sellerShipping: {
    rowLabel: "Frete vendedor",
    amountLabel: "Frete",
    description:
      "Custo de frete pago pelo vendedor, por anúncio/SKU — disponível apenas quando estimado pelos pedidos (mês sem fatura consolidada alinhada ao período civil).",
  },
  adsCost: {
    rowLabel: "Campanhas ADS",
    amountLabel: "Gasto ADS",
    description:
      "Gasto com campanhas de Product Ads no mês, por anúncio.",
  },
};

const LINE_BREAKDOWN_FIELD: Partial<
  Record<AuditKind, keyof DreMonthView>
> = {
  revenue: "revenueBreakdown",
  cancelledSales: "cancelledSalesBreakdown",
  saleFee: "saleFeeBreakdown",
  sellerShipping: "sellerShippingBreakdown",
  adsCost: "adsCostBreakdown",
};

type LineAuditState = {
  items: DreLineBreakdownItem[];
  unavailable: boolean;
  needsResync: boolean;
};

/** Resolve itens/estado do modal de auditoria genérica para as linhas que não são Custo produto/Imposto ML. */
function resolveLineAuditState(
  data: DreYearView,
  target: AuditTarget,
): LineAuditState {
  if (target === null || target.kind === "productCost" || target.kind === "tax") {
    return { items: [], unavailable: false, needsResync: false };
  }

  const months =
    target.period === "year"
      ? data.months
      : data.months.filter((m) => m.month === target.period);
  const relevantMonths = months.filter((m) => m.lines !== null);

  const field = LINE_BREAKDOWN_FIELD[target.kind];
  if (!field) return { items: [], unavailable: false, needsResync: false };

  const items = getYearLineBreakdown(
    months.map((m) => (m[field] as DreLineBreakdownItem[] | null) ?? null),
  );

  if (target.kind === "saleFee" || target.kind === "sellerShipping") {
    const billingOnly =
      relevantMonths.length > 0 &&
      relevantMonths.every((m) => m.billingSource === "billing");
    const anyFallbackMissing = relevantMonths.some(
      (m) => m.billingSource === "fallback" && m[field] === null,
    );
    return { items, unavailable: billingOnly, needsResync: anyFallbackMissing };
  }

  const needsResync = relevantMonths.some((m) => m[field] === null);
  return { items, unavailable: false, needsResync };
}

/** true quando algum mês do alvo de auditoria tem lançamentos mas não tem o detalhamento salvo (sincronizado antes desta funcionalidade). */
function auditTargetNeedsResync(data: DreYearView, target: AuditTarget): boolean {
  if (target === null) return false;
  const months =
    target.period === "year"
      ? data.months
      : data.months.filter((m) => m.month === target.period);
  return months.some((m) =>
    target.kind === "productCost"
      ? m.lines !== null && m.productCostBreakdown === null
      : m.lines !== null && m.taxBreakdown === null,
  );
}

function renderLabelCell(row: DreTableRow) {
  const source =
    row.type === "fixed-cost" ||
    row.type === "operational-cost" ||
    row.type === "investment-cost"
      ? row.source
      : row.type === "static"
        ? row.source
        : undefined;
  const indent =
    row.type === "fixed-cost" ||
    row.type === "operational-cost" ||
    row.type === "investment-cost" ||
    (row.type === "static" && row.indent);

  const labelSpan = <span className={rowLabelClass(row)}>{row.label}</span>;

  return (
    <div
      className={cn("flex min-w-0 items-start", indent && "pl-2.5")}
      title={source ? undefined : row.label}
    >
      {source ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help underline decoration-dotted decoration-1 underline-offset-2">
              {labelSpan}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" align="start">
            Fonte: {sourceOriginLabel(source)}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelSpan
      )}
    </div>
  );
}

function renderValueCell(
  row: DreTableRow,
  month: DreMonthView,
  onLineChange: DreYearTableProps["onLineChange"],
  onFixedCostChange: DreYearTableProps["onFixedCostChange"],
  onOperationalCostChange: DreYearTableProps["onOperationalCostChange"],
  onInvestmentCostChange: DreYearTableProps["onInvestmentCostChange"],
  onAuditClick?: (kind: AuditKind, month: number) => void,
  onEditingChange?: (editing: boolean, month: number, rowId: string) => void,
) {
  const canEditMonth = !month.isFutureMonth;
  const notifyEditing = (editing: boolean) =>
    onEditingChange?.(editing, month.month, row.id);

  if (row.type === "fixed-cost") {
    const stored = month.fixedCostValues[row.costItemId];
    const override = month.fixedCostOverrides[row.costItemId];
    const displayAmount = stored === null || stored === undefined ? null : -stored;
    const inherited = override === null && stored !== null;
    return (
      <DreInlineMoneyCell
        displayAmount={displayAmount}
        label={`${row.label} (${month.label})`}
        allowNegative
        disabled={!canEditMonth}
        muted={inherited}
        title={
          inherited
            ? "Valor herdado do mês anterior — duplo-clique para editar"
            : undefined
        }
        onEditingChange={notifyEditing}
        onCommit={(amount) =>
          onFixedCostChange(
            row.costItemId,
            month.month,
            amount === null ? null : Math.abs(amount),
          )
        }
      />
    );
  }

  if (row.type === "operational-cost") {
    const stored = month.operationalCostValues[row.costItemId];
    const override = month.operationalCostOverrides[row.costItemId];
    const displayAmount = stored === null || stored === undefined ? null : -stored;
    const inherited = override === null && stored !== null;
    return (
      <DreInlineMoneyCell
        displayAmount={displayAmount}
        label={`${row.label} (${month.label})`}
        allowNegative
        disabled={!canEditMonth}
        muted={inherited}
        title={
          inherited
            ? "Valor herdado do mês anterior — duplo-clique para editar"
            : undefined
        }
        onEditingChange={notifyEditing}
        onCommit={(amount) =>
          onOperationalCostChange(
            row.costItemId,
            month.month,
            amount === null ? null : Math.abs(amount),
          )
        }
      />
    );
  }

  if (row.type === "investment-cost") {
    const stored = month.investmentCostValues[row.costItemId];
    const override = month.investmentCostOverrides[row.costItemId];
    const displayAmount = stored === null || stored === undefined ? null : -stored;
    const inherited = override === null && stored !== null;
    return (
      <DreInlineMoneyCell
        displayAmount={displayAmount}
        label={`${row.label} (${month.label})`}
        allowNegative
        disabled={!canEditMonth}
        muted={inherited}
        title={
          inherited
            ? "Valor herdado do mês anterior — duplo-clique para editar"
            : undefined
        }
        onEditingChange={notifyEditing}
        onCommit={(amount) =>
          onInvestmentCostChange(
            row.costItemId,
            month.month,
            amount === null ? null : Math.abs(amount),
          )
        }
      />
    );
  }

  const { amount } = getCellValue(row, month);
  const colored = isColoredRow(row);
  const moneyLabel = formatFinancialMoney(amount);
  const valueClassName = cn(
    "whitespace-nowrap text-center text-[12.5px] font-bold tabular-nums leading-tight",
    colored ? "text-white" : "",
  );

  const editableKey = getEditableLineKey(row);
  const auditKind = getAuditKindForRow(row);
  const needsFullReportAlert =
    row.type === "static" &&
    (row.id === "fullShippingMl" || row.id === "fullNonComplianceMl") &&
    month.lines !== null &&
    !month.fullReportSourced;

  if (editableKey && canEditMonth) {
    return (
      <div className={cn(valueClassName, "inline-flex items-center justify-center gap-1.5")}>
        {needsFullReportAlert ? (
          <FullReportMissingTooltip month={month} colored={colored} />
        ) : null}
        <DreInlineMoneyCell
          displayAmount={amount}
          label={`${row.label} (${month.label})`}
          allowNegative={editableKey !== "revenueMl"}
          onAudit={
            auditKind && onAuditClick
              ? () => onAuditClick(auditKind, month.month)
              : undefined
          }
          onEditingChange={notifyEditing}
          onCommit={(next) => {
            if (next === null) return;
            onLineChange(editableKey, month.month, next);
          }}
        />
      </div>
    );
  }

  const auditable = Boolean(auditKind && onAuditClick);
  return (
    <div className={cn(valueClassName, "inline-flex items-center justify-center gap-1.5")}>
      {needsFullReportAlert ? (
        <FullReportMissingTooltip month={month} colored={colored} />
      ) : null}
      <div
        role={auditable ? "button" : undefined}
        tabIndex={auditable ? 0 : undefined}
        className={cn(
          auditable &&
            "cursor-pointer rounded-sm underline decoration-dotted decoration-1 underline-offset-2 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
        )}
        title={
          auditable
            ? `Clique para auditar ${row.label} (${month.label})`
            : undefined
        }
        onClick={
          auditable
            ? (e) => {
                e.stopPropagation();
                onAuditClick!(auditKind!, month.month);
              }
            : undefined
        }
        onKeyDown={
          auditable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAuditClick!(auditKind!, month.month);
                }
              }
            : undefined
        }
      >
        {moneyLabel}
      </div>
    </div>
  );
}

function renderPercentCell(percent: number | null, colored: boolean) {
  return (
    <div
      className={cn(
        "whitespace-nowrap text-center text-[12.5px] font-bold tabular-nums leading-tight",
        colored ? "text-white" : valueToneClass(percent),
      )}
    >
      {formatFinancialPercent(percent)}
    </div>
  );
}

function getYearTotalForRow(
  row: DreTableRow,
  data: DreYearView,
): { amount: number | null; percent: number | null } {
  if (row.type === "fixed-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.fixedCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return { amount: hasAny ? -sum : null, percent: null };
  }

  if (row.type === "operational-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.operationalCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return { amount: hasAny ? -sum : null, percent: null };
  }

  if (row.type === "investment-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.investmentCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return { amount: hasAny ? -sum : null, percent: null };
  }

  const totals = data.yearTotals;
  if (!totals) return { amount: null, percent: null };

  switch (row.id) {
    case "totalEntrada":
      return { amount: totals.totalEntrada, percent: null };
    case "revenueMl":
      return {
        amount: data.months.reduce((s, m) => s + (m.lines?.revenueMl ?? 0), 0),
        percent: null,
      };
    case "totalCustoOperacional":
      return { amount: totals.totalCustoOperacional, percent: null };
    case "margemContribuicao":
      return {
        amount: totals.margemContribuicao,
        percent: totals.margemContribuicaoPercent,
      };
    case "totalCustoFixo":
      return { amount: totals.totalCustoFixo, percent: null };
    case "adsCost":
      return {
        amount: -totals.adsCost,
        percent: null,
      };
    case "lucroOperacionalAntesInvestimentos":
      return {
        amount: totals.lucroOperacionalAntesInvestimentos,
        percent: totals.lucroOperacionalAntesInvestimentosPercent,
      };
    case "totalInvestimento":
      return { amount: totals.totalInvestimento, percent: null };
    case "lucroOperacional":
      return {
        amount: totals.lucroOperacional,
        percent: totals.lucroOperacionalPercent,
      };
    default:
      if (row.type === "static" && row.lineKey) {
        const sum = data.months.reduce(
          (s, m) => s + (m.lines?.[row.lineKey!] ?? 0),
          0,
        );
        const hasData = data.months.some((m) => m.lines !== null);
        return { amount: hasData ? sum : null, percent: null };
      }
      return { amount: null, percent: null };
  }
}

/** Mobile: em vez de "mês" (índice em data.months), a seleção pode ser "total" (coluna Total do ano). */
type DreMobileSelection = number | "total";

function DreMobileRow({
  row,
  isAlt,
  selection,
  data,
  onLineChange,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
  onAuditClick,
}: {
  row: DreTableRow;
  isAlt: boolean;
  selection: DreMobileSelection;
  data: DreYearView;
  onLineChange: DreYearTableProps["onLineChange"];
  onFixedCostChange: DreYearTableProps["onFixedCostChange"];
  onOperationalCostChange: DreYearTableProps["onOperationalCostChange"];
  onInvestmentCostChange: DreYearTableProps["onInvestmentCostChange"];
  onAuditClick: (kind: AuditKind, period: number | "year") => void;
}) {
  const colored = isColoredRow(row);
  const bg = rowBackgroundClass(row);
  const showPercentRow = row.type === "static" && row.showPercent;
  const isTotal = selection === "total";
  const month = isTotal ? null : data.months[selection];
  const auditKind = getAuditKindForRow(row);

  const valueNode = isTotal ? (
    <div
      className={cn(
        "inline-flex w-full items-center justify-center gap-1.5",
        colored ? "text-white" : "",
      )}
    >
      <div
        role={auditKind ? "button" : undefined}
        tabIndex={auditKind ? 0 : undefined}
        className={cn(
          "whitespace-nowrap text-center text-[13px] font-bold tabular-nums leading-tight",
          auditKind &&
            "cursor-pointer rounded-sm underline decoration-dotted decoration-1 underline-offset-2 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
        )}
        title={
          auditKind ? `Clique para auditar ${row.label} (ano)` : undefined
        }
        onClick={
          auditKind
            ? () => onAuditClick(auditKind, "year")
            : undefined
        }
        onKeyDown={
          auditKind
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAuditClick(auditKind, "year");
                }
              }
            : undefined
        }
      >
        {formatFinancialMoney(getYearTotalForRow(row, data).amount)}
      </div>
    </div>
  ) : (
    renderValueCell(
      row,
      month!,
      onLineChange,
      onFixedCostChange,
      onOperationalCostChange,
      onInvestmentCostChange,
      (kind, m) => onAuditClick(kind, m),
    )
  );

  const percent = isTotal
    ? getYearTotalForRow(row, data).percent
    : getCellValue(row, month!).percent;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg px-3 py-2.5",
        colored ? bg : isAlt ? "bg-[var(--muted)]/25" : "bg-transparent",
      )}
    >
      <div className="min-w-0 flex-1">{renderLabelCell(row)}</div>
      <div className="shrink-0 text-right">
        {valueNode}
        {showPercentRow ? (
          <div className="mt-0.5">{renderPercentCell(percent, colored)}</div>
        ) : null}
      </div>
    </div>
  );
}

function DreYearTableMobile({
  data,
  showDetails,
  onToggleDetails,
  syncingMonths,
  onSyncMonth,
  onLineChange,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
}: DreYearTableProps) {
  const rows = useMemo(
    () =>
      buildDreTableRows(
        data.costItems,
        data.operationalCostItems,
        data.investmentCostItems,
        showDetails,
      ),
    [data.costItems, data.operationalCostItems, data.investmentCostItems, showDetails],
  );

  const altRowFlags = useMemo(() => {
    return rows.map((row, index) => {
      if (isColoredRow(row)) return false;
      const whiteRowsBefore = rows
        .slice(0, index)
        .filter((r) => !isColoredRow(r)).length;
      return whiteRowsBefore % 2 === 1;
    });
  }, [rows]);

  const defaultIndex = useMemo(() => {
    const currentIdx = data.months.findIndex((m) => m.isCurrentMonth);
    if (currentIdx >= 0) return currentIdx;
    return Math.max(0, data.months.length - 1);
  }, [data.months]);

  const [selection, setSelection] = useState<DreMobileSelection>(defaultIndex);
  const [auditTarget, setAuditTarget] = useState<AuditTarget>(null);

  const productCostAuditItems =
    auditTarget === null || auditTarget.kind !== "productCost"
      ? []
      : auditTarget.period === "year"
        ? getYearProductCostBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.productCostBreakdown ?? []);
  const taxAuditItems =
    auditTarget === null || auditTarget.kind !== "tax"
      ? []
      : auditTarget.period === "year"
        ? getYearTaxBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.taxBreakdown ?? []);
  const auditTitle =
    auditTarget === null
      ? ""
      : auditTarget.period === "year"
        ? `Ano ${data.year}`
        : (data.months.find((m) => m.month === auditTarget.period)?.label ??
          `Mês ${auditTarget.period}`);
  const lineAuditState = resolveLineAuditState(data, auditTarget);
  const lineAuditText =
    auditTarget !== null ? LINE_AUDIT_TEXT[auditTarget.kind] : undefined;

  const selectedMonth = selection === "total" ? null : data.months[selection];
  const alertMessages = selectedMonth ? getMonthAlertMessages(selectedMonth) : [];

  const selectOptions = [
    ...data.months.map((month, index) => ({
      value: String(index),
      label: month.label,
    })),
    { value: "total", label: `Total ${data.year}` },
  ];

  function goToOffset(offset: number) {
    setSelection((prev) => {
      const base = prev === "total" ? data.months.length : prev;
      const next = base + offset;
      if (next < 0) return 0;
      if (next >= data.months.length) return "total";
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {onToggleDetails ? (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant={showDetails ? "secondary" : "default"}
            size="sm"
            className="h-8 text-xs font-semibold shadow-sm"
            onClick={onToggleDetails}
          >
            {showDetails ? "Ocultar detalhes" : "Mostrar detalhes"}
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Período anterior"
          disabled={selection === 0}
          onClick={() => goToOffset(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <FormSelect
          value={String(selection)}
          onValueChange={(value) =>
            setSelection(value === "total" ? "total" : Number(value))
          }
          options={selectOptions}
          className="flex-1"
          triggerClassName="w-full"
          aria-label="Selecionar período"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Próximo período"
          disabled={selection === "total"}
          onClick={() => goToOffset(1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      {selectedMonth ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          <span>Sync: {formatSyncTime(selectedMonth.syncedAt)}</span>
          {alertMessages.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertCircle className="size-3.5" aria-hidden />
              {alertMessages.length} aviso{alertMessages.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {selectedMonth.canSync ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto gap-1.5"
              disabled={syncingMonths.has(selectedMonth.month)}
              onClick={() => onSyncMonth(selectedMonth.month)}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  syncingMonths.has(selectedMonth.month) && "animate-spin",
                )}
                aria-hidden
              />
              Sincronizar
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          Soma de todos os meses de {data.year}.
        </div>
      )}

      {alertMessages.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-900">
          {alertMessages.map((message) => (
            <li key={message}>• {message}</li>
          ))}
        </ul>
      ) : null}

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        {rows.map((row, index) => (
          <DreMobileRow
            key={row.id}
            row={row}
            isAlt={altRowFlags[index]}
            selection={selection}
            data={data}
            onLineChange={onLineChange}
            onFixedCostChange={onFixedCostChange}
            onOperationalCostChange={onOperationalCostChange}
            onInvestmentCostChange={onInvestmentCostChange}
            onAuditClick={(kind, period) => setAuditTarget({ kind, period })}
          />
        ))}
      </div>
      <DreProductCostAuditModal
        open={auditTarget !== null && auditTarget.kind === "productCost"}
        title={auditTitle}
        items={productCostAuditItems}
        needsResync={auditTargetNeedsResync(data, auditTarget)}
        onClose={() => setAuditTarget(null)}
      />
      <DreTaxAuditModal
        open={auditTarget !== null && auditTarget.kind === "tax"}
        title={auditTitle}
        items={taxAuditItems}
        needsResync={auditTargetNeedsResync(data, auditTarget)}
        onClose={() => setAuditTarget(null)}
      />
      <DreLineAuditModal
        open={
          auditTarget !== null &&
          auditTarget.kind !== "productCost" &&
          auditTarget.kind !== "tax"
        }
        title={auditTitle}
        rowLabel={lineAuditText?.rowLabel ?? ""}
        amountLabel={lineAuditText?.amountLabel ?? "Valor"}
        description={lineAuditText?.description ?? ""}
        items={lineAuditState.items}
        unavailable={lineAuditState.unavailable}
        needsResync={lineAuditState.needsResync}
        onClose={() => setAuditTarget(null)}
      />
    </div>
  );
}

function MonthHeaderCell({
  year,
  month,
  syncing,
  selected,
  dimmed,
  onSync,
  onToggleSelect,
}: {
  year: number;
  month: DreMonthView;
  syncing: boolean;
  selected: boolean;
  dimmed: boolean;
  onSync: () => void;
  onToggleSelect: () => void;
}) {
  const alertMessages = getMonthAlertMessages(month);
  const hasAlert = alertMessages.length > 0;

  return (
    <th
      className={cn(
        "relative cursor-pointer border-b border-[var(--border)] px-1 py-2 text-center font-normal transition-colors",
        selected
          ? "bg-[var(--primary)]/10"
          : "bg-white hover:bg-[var(--muted)]/40",
        month.isFutureMonth && "opacity-45",
        dimmed && DIM_CLASS,
      )}
      onClick={onToggleSelect}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Destacar coluna de ${month.label}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect();
        }
      }}
    >
      <div className="flex items-center justify-center gap-0.5">
        <MonthSyncTooltip year={year} month={month}>
          <span
            className={cn(
              "cursor-pointer text-[12.5px] font-bold tracking-wider text-[var(--muted-foreground)]",
              month.isCurrentMonth && "text-[var(--primary)]",
              !month.syncedAt && !month.isFutureMonth && "text-amber-700",
              selected && "text-[var(--primary)]",
            )}
          >
            {dreMonthShortLabel(month.month)}
          </span>
        </MonthSyncTooltip>
        {hasAlert ? (
          <MonthAlertsTooltip month={month} messages={alertMessages} />
        ) : null}
        {month.canSync ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 rounded-sm border border-[var(--border)] p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label={`Sincronizar ${month.label}`}
            disabled={syncing}
            onClick={(e) => {
              e.stopPropagation();
              onSync();
            }}
          >
            <RefreshCw
              className={cn("size-3", syncing && "animate-spin")}
              aria-hidden
              // style={{ padding: 2 }}
            />
          </Button>
        ) : null}
      </div>
    </th>
  );
}

export function DreYearTable(props: DreYearTableProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DreYearTableMobile {...props} />;
  }
  return <DreYearTableDesktop {...props} />;
}

function DreYearTableDesktop({
  data,
  showDetails,
  onToggleDetails,
  syncingMonths,
  onSyncMonth,
  onLineChange,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
}: DreYearTableProps) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  /** Célula em edição — esmaece TODO o restante do DRE, inclusive a coluna atual. */
  const [editingCell, setEditingCell] = useState<{
    month: number;
    rowId: string;
  } | null>(null);
  const [auditTarget, setAuditTarget] = useState<AuditTarget>(null);
  const isEditing = editingCell !== null;
  const columnFocusMonth = isEditing ? null : selectedMonth;

  function isEditingThisCell(month: number, rowId: string) {
    return (
      editingCell !== null &&
      editingCell.month === month &&
      editingCell.rowId === rowId
    );
  }

  const productCostAuditItems =
    auditTarget === null || auditTarget.kind !== "productCost"
      ? []
      : auditTarget.period === "year"
        ? getYearProductCostBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.productCostBreakdown ?? []);
  const taxAuditItems =
    auditTarget === null || auditTarget.kind !== "tax"
      ? []
      : auditTarget.period === "year"
        ? getYearTaxBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.taxBreakdown ?? []);
  const auditTitle =
    auditTarget === null
      ? ""
      : auditTarget.period === "year"
        ? `Ano ${data.year}`
        : (data.months.find((m) => m.month === auditTarget.period)?.label ??
          `Mês ${auditTarget.period}`);
  const lineAuditState = resolveLineAuditState(data, auditTarget);
  const lineAuditText =
    auditTarget !== null ? LINE_AUDIT_TEXT[auditTarget.kind] : undefined;

  const rows = buildDreTableRows(
    data.costItems,
    data.operationalCostItems,
    data.investmentCostItems,
    showDetails,
  );

  // Zebra striping só entre as linhas "brancas" (detalhe) — as linhas de
  // grupo/resultado (verde/vermelho) ficam de fora da contagem.
  const altRowFlags = rows.map((row, index) => {
    if (isColoredRow(row)) return false;
    const whiteRowsBefore = rows
      .slice(0, index)
      .filter((r) => !isColoredRow(r)).length;
    return whiteRowsBefore % 2 === 1;
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
        {onToggleDetails ? (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2">
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {showDetails
                ? "Exibindo linhas detalhadas (custos, tarifas, fretes…)."
                : "Detalhes ocultos — só totais e resultados."}
            </p>
            <Button
              type="button"
              variant={showDetails ? "outline" : "default"}
              size="sm"
              className="h-7 shrink-0 text-[11px] font-semibold"
              onClick={onToggleDetails}
            >
              {showDetails ? "Ocultar detalhes" : "Mostrar detalhes"}
            </Button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] table-fixed border-collapse text-[12.5px]">
          <colgroup>
            <col style={{ width: "8%" }} />
            {data.months.map((month) => (
              <col key={month.month} style={{ width: `${84 / 12}%` }} />
            ))}
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead>
            <tr>
              <th
                className={cn(
                  "sticky left-0 z-20 border-b border-[var(--border)] bg-white px-3 py-2 text-left text-[12.5px] font-bold uppercase text-[var(--muted-foreground)]",
                  (isEditing || columnFocusMonth !== null) && DIM_CLASS,
                )}
              >
                Linha
              </th>
              {data.months.map((month) => (
                <MonthHeaderCell
                  key={month.month}
                  year={data.year}
                  month={month}
                  syncing={syncingMonths.has(month.month)}
                  selected={
                    !isEditing && selectedMonth === month.month
                  }
                  dimmed={
                    isEditing ||
                    (columnFocusMonth !== null &&
                      columnFocusMonth !== month.month)
                  }
                  onSync={() => onSyncMonth(month.month)}
                  onToggleSelect={() => {
                    if (isEditing) return;
                    setSelectedMonth((prev) =>
                      prev === month.month ? null : month.month,
                    );
                  }}
                />
              ))}
              <th
                className={cn(
                  "border-b border-[var(--border)] bg-[var(--muted)]/30 px-2 py-2 text-center text-[12.5px] font-bold uppercase text-[var(--muted-foreground)]",
                  (isEditing || columnFocusMonth !== null) && DIM_CLASS,
                )}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const bg = rowBackgroundClass(row);
              const showPercentRow = row.type === "static" && row.showPercent;
              const isAlt = altRowFlags[index];
              // Linhas com percentual logo abaixo não desenham borda inferior —
              // a separação já é feita pela borda da própria linha de percentual.
              const dividerStyle = showPercentRow
                ? undefined
                : MAIN_ROW_DIVIDER_STYLE;
              const rowClassName = isAlt ? undefined : bg;
              const cellStyle = isAlt
                ? { ...dividerStyle, backgroundColor: ALT_ROW_BG }
                : dividerStyle;
              const yearAuditKind = getAuditKindForRow(row);

              return (
                <Fragment key={row.id}>
                  <tr className={rowClassName}>
                    <td
                      className={cn(
                        "sticky left-0 z-10 px-3 py-2",
                        rowClassName,
                        (isEditing || columnFocusMonth !== null) && DIM_CLASS,
                      )}
                      style={cellStyle}
                    >
                      {renderLabelCell(row)}
                    </td>
                    {data.months.map((month) => {
                      const editingThis = isEditingThisCell(
                        month.month,
                        row.id,
                      );
                      return (
                        <td
                          key={month.month}
                          className={cn(
                            "px-1.5 py-2 text-center align-middle",
                            editingThis
                              ? cn(
                                  "relative z-30",
                                  SELECTED_MONTH_CELL_CLASS,
                                  bg || "bg-white",
                                )
                              : isEditing
                                ? DIM_CLASS
                                : month.month === columnFocusMonth
                                  ? cn(
                                      SELECTED_MONTH_CELL_CLASS,
                                      bg || "bg-white",
                                    )
                                  : columnFocusMonth !== null && DIM_CLASS,
                          )}
                          style={cellStyle}
                        >
                          {renderValueCell(
                            row,
                            month,
                            onLineChange,
                            onFixedCostChange,
                            onOperationalCostChange,
                            onInvestmentCostChange,
                            (kind, m) =>
                              setAuditTarget({ kind, period: m }),
                            (editing, m, rowId) =>
                              setEditingCell(
                                editing ? { month: m, rowId } : null,
                              ),
                          )}
                        </td>
                      );
                    })}
                    <td
                      className={cn(
                        "px-2 py-2 text-center align-middle",
                        rowClassName,
                        (isEditing || columnFocusMonth !== null) && DIM_CLASS,
                      )}
                      style={cellStyle}
                    >
                      <div
                        className={cn(
                          "inline-flex w-full items-center justify-center gap-1.5",
                          isColoredRow(row) ? "text-white" : "",
                        )}
                      >
                        <div
                          role={yearAuditKind ? "button" : undefined}
                          tabIndex={yearAuditKind ? 0 : undefined}
                          className={cn(
                            "whitespace-nowrap text-center text-[12.5px] font-bold tabular-nums leading-tight",
                            yearAuditKind &&
                              "cursor-pointer rounded-sm underline decoration-dotted decoration-1 underline-offset-2 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
                          )}
                          title={
                            yearAuditKind
                              ? `Clique para auditar ${row.label} (ano)`
                              : undefined
                          }
                          onClick={
                            yearAuditKind
                              ? () =>
                                  setAuditTarget({
                                    kind: yearAuditKind,
                                    period: "year",
                                  })
                              : undefined
                          }
                          onKeyDown={
                            yearAuditKind
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setAuditTarget({
                                      kind: yearAuditKind,
                                      period: "year",
                                    });
                                  }
                                }
                              : undefined
                          }
                        >
                          {formatFinancialMoney(
                            getYearTotalForRow(row, data).amount,
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {showPercentRow ? (
                    <tr key={`${row.id}-percent`} className={bg}>
                      <td
                        className={cn(
                          "sticky left-0 z-10 px-3 py-1.5",
                          bg,
                          (isEditing || columnFocusMonth !== null) &&
                            DIM_CLASS,
                        )}
                        style={PERCENT_ROW_DIVIDER_STYLE}
                      />
                      {data.months.map((month) => (
                        <td
                          key={month.month}
                          className={cn(
                            "px-1.5 py-1.5 text-center align-middle",
                            isEditing
                              ? DIM_CLASS
                              : month.month === columnFocusMonth
                                ? cn(SELECTED_MONTH_CELL_CLASS, bg)
                                : columnFocusMonth !== null && DIM_CLASS,
                          )}
                          style={PERCENT_ROW_DIVIDER_STYLE}
                        >
                          {renderPercentCell(
                            getCellValue(row, month).percent,
                            isColoredRow(row),
                          )}
                        </td>
                      ))}
                      <td
                        className={cn(
                          "px-2 py-1.5 text-center align-middle",
                          bg,
                          (isEditing || columnFocusMonth !== null) &&
                            DIM_CLASS,
                        )}
                        style={PERCENT_ROW_DIVIDER_STYLE}
                      >
                        {renderPercentCell(
                          getYearTotalForRow(row, data).percent,
                          isColoredRow(row),
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      <DreProductCostAuditModal
        open={auditTarget !== null && auditTarget.kind === "productCost"}
        title={auditTitle}
        items={productCostAuditItems}
        needsResync={auditTargetNeedsResync(data, auditTarget)}
        onClose={() => setAuditTarget(null)}
      />
      <DreTaxAuditModal
        open={auditTarget !== null && auditTarget.kind === "tax"}
        title={auditTitle}
        items={taxAuditItems}
        needsResync={auditTargetNeedsResync(data, auditTarget)}
        onClose={() => setAuditTarget(null)}
      />
      <DreLineAuditModal
        open={
          auditTarget !== null &&
          auditTarget.kind !== "productCost" &&
          auditTarget.kind !== "tax"
        }
        title={auditTitle}
        rowLabel={lineAuditText?.rowLabel ?? ""}
        amountLabel={lineAuditText?.amountLabel ?? "Valor"}
        description={lineAuditText?.description ?? ""}
        items={lineAuditState.items}
        unavailable={lineAuditState.unavailable}
        needsResync={lineAuditState.needsResync}
        onClose={() => setAuditTarget(null)}
      />
    </TooltipProvider>
  );
}
