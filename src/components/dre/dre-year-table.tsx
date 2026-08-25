"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NumericFormat } from "react-number-format";
import {
  AlertCircle,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Landmark,
  List,
  PiggyBank,
  Receipt,
  RefreshCw,
  Rocket,
  TrendingDown,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  percentOfRevenue,
  type DreComputedTotals,
  type DreEditableLineKey,
  type DreLineBreakdownItem,
} from "@/lib/dre/dre-calculations";
import {
  buildDreTableRows,
  DEFAULT_DRE_VISIBILITY,
  dreMonthShortLabel,
  filterRowsByVisibility,
  getCellValue,
  isColoredRow,
  isDetailRow,
  rowBackgroundClass,
  rowLabelClass,
  valueToneClass,
  type DreStaticRowId,
  type DreTableRow,
  type DreVisibilitySettings,
} from "@/lib/dre/dre-table-rows";
import { reportsConfig } from "@/config/reports";
import {
  formatCalendarRangeYmd,
  getCalendarMonthRange,
} from "@/lib/mercadolibre/revenue-periods";
import { buildMercadoLivreCostsMetricsUrl } from "@/lib/mercadolibre/costs-metrics-url";
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

/** Zebra striping das linhas de detalhe. */
const ALT_ROW_BG = "var(--muted)";

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

/** Transição de abrir/fechar linhas de detalhe (Ocultar / Mostrar detalhes). */
const DETAILS_REVEAL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const DETAILS_REVEAL_MS = 320;

function buildDetailIndexMap(rows: DreTableRow[]): Map<string, number> {
  const map = new Map<string, number>();
  let i = 0;
  for (const row of rows) {
    if (isDetailRow(row)) {
      map.set(row.id, i);
      i += 1;
    }
  }
  return map;
}

function detailRevealStyle(
  detailIndex: number,
  detailCount: number,
  open: boolean,
): CSSProperties {
  const capped = Math.min(Math.max(detailCount - 1, 0), 14);
  const delayMs = open
    ? Math.min(detailIndex, capped) * 22
    : Math.min(capped - detailIndex, capped) * 16;
  return {
    transitionDuration: `${DETAILS_REVEAL_MS}ms`,
    transitionTimingFunction: DETAILS_REVEAL_EASE,
    transitionDelay: `${Math.max(0, delayMs)}ms`,
  };
}

function altRowFlagsForView(
  rows: DreTableRow[],
  showDetails: boolean,
): boolean[] {
  return rows.map((row, index) => {
    if (isColoredRow(row)) return false;
    if (!showDetails && isDetailRow(row)) return false;
    const whiteRowsBefore = rows
      .slice(0, index)
      .filter(
        (r) => !isColoredRow(r) && (showDetails || !isDetailRow(r)),
      ).length;
    return whiteRowsBefore % 2 === 1;
  });
}

function DetailAnimatedCell({
  isDetail,
  open,
  detailIndex,
  detailCount,
  children,
  className,
  style,
  contentClassName,
}: {
  isDetail: boolean;
  open: boolean;
  detailIndex: number;
  detailCount: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentClassName: string;
}) {
  if (!isDetail) {
    return (
      <td className={className} style={style}>
        {children}
      </td>
    );
  }

  const reveal = detailRevealStyle(detailIndex, detailCount, open);
  return (
    <td
      className={cn(className, "p-0")}
      style={open ? style : undefined}
    >
      <div
        className={cn(
          "grid transition-[grid-template-rows] motion-reduce:transition-none motion-reduce:delay-0",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        style={reveal}
      >
        <div
          className={cn(
            "overflow-hidden transition-opacity motion-reduce:transition-none motion-reduce:delay-0",
            open ? "opacity-100" : "opacity-0",
          )}
          style={reveal}
        >
          <div className={contentClassName}>{children}</div>
        </div>
      </div>
    </td>
  );
}

type DreYearTableProps = {
  data: DreYearView;
  visibility?: DreVisibilitySettings;
  showDetails: boolean;
  onToggleDetails?: () => void;
  selectedMonth?: number | null;
  onSelectedMonthChange?: (month: number | null) => void;
  syncingMonths: Set<number>;
  /** Mensagem de estágio SSE por mês (ex.: "Importando Relatório Full…"). */
  syncingMonthMessages?: Record<number, string>;
  onSyncMonth: (month: number) => void;
  onLineChange: (
    lineKey: DreEditableLineKey,
    month: number,
    amount: number,
  ) => void;
  onLineRestore?: (lineKey: DreEditableLineKey, month: number) => void;
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
  onNonOperationalOutChange: (
    costItemId: string,
    month: number,
    amount: number | null,
  ) => void;
  onNonOperationalInChange: (
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

function AdjustedBadge({
  onRestore,
}: {
  onRestore?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span
        className="rounded bg-amber-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
        title="Valor ajustado manualmente após o último sync"
      >
        ajustado
      </span>
      {onRestore ? (
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center rounded text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] dark:text-amber-200 dark:hover:bg-amber-950/60"
          title="Restaurar valor do último sync"
          aria-label="Restaurar valor do último sync"
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
        >
          <Undo2 className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

function DreInlineMoneyCell({
  displayAmount,
  label,
  allowNegative = true,
  disabled = false,
  muted = false,
  adjusted = false,
  title,
  onCommit,
  onEditingChange,
  onAudit,
  onRestore,
  leading,
  trailing,
}: {
  displayAmount: number | null;
  label: string;
  allowNegative?: boolean;
  disabled?: boolean;
  muted?: boolean;
  /** Célula com valor diferente do último sync. */
  adjusted?: boolean;
  title?: string;
  onCommit: (amount: number | null) => void;
  /** Notifica o pai ao entrar/sair do modo de edição (para esmaecer o restante do DRE). */
  onEditingChange?: (editing: boolean) => void;
  /** Clique simples abre auditoria (atrasado para não conflitar com duplo-clique de edição). */
  onAudit?: () => void;
  onRestore?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(displayAmount);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [panelEntered, setPanelEntered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedOnceRef = useRef(false);

  const EDITOR_MIN_WIDTH_PX = 320;
  const VIEWPORT_PAD_PX = 16;
  const EDITOR_PANEL_HEIGHT_PX = 148;

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

    let left = rect.right - width;
    left = Math.max(
      VIEWPORT_PAD_PX,
      Math.min(left, vw - width - VIEWPORT_PAD_PX),
    );

    // Prefere abrir abaixo da célula; sobe se não couber.
    let top = rect.bottom + 8;
    if (top + EDITOR_PANEL_HEIGHT_PX > vh - VIEWPORT_PAD_PX) {
      top = rect.top - EDITOR_PANEL_HEIGHT_PX - 8;
    }
    top = Math.max(
      VIEWPORT_PAD_PX,
      Math.min(top, vh - EDITOR_PANEL_HEIGHT_PX - VIEWPORT_PAD_PX),
    );

    setPanelStyle({
      position: "fixed",
      left,
      top,
      width,
      zIndex: 60,
    });
  }

  useEffect(() => {
    if (!editing || isMobile) return;
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
  }, [editing, isMobile]);

  const hasEditorPanel = panelStyle !== null;

  useEffect(() => {
    if (!editing || isMobile || !hasEditorPanel) return;
    // Dois rAFs: monta em opacity-0 e só então anima até o estado final.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPanelEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [editing, isMobile, hasEditorPanel]);

  useEffect(() => {
    if (!editing) {
      focusedOnceRef.current = false;
      return;
    }
    if (isMobile) {
      // Sheet: espera abrir e então foca (teclado nativo).
      const t = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => window.clearTimeout(t);
    }
    if (!panelStyle || focusedOnceRef.current) return;
    focusedOnceRef.current = true;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing, isMobile, panelStyle]);

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
    setPanelEntered(false);
    onEditingChange?.(false);
  }

  function commit(next: number | null) {
    setEditing(false);
    setPanelStyle(null);
    setPanelEntered(false);
    onEditingChange?.(false);
    const prev = displayAmount;
    const same =
      (next === null && prev === null) ||
      (next !== null && prev !== null && Math.abs(next - prev) < 0.000_001);
    if (!same) {
      onCommit(next);
    }
  }

  const moneyInput = (
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
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      aria-label={`Editar ${label}`}
      className={
        isMobile
          ? "h-16 w-full rounded-2xl border-0 bg-[var(--muted)]/50 px-4 text-center text-3xl font-bold tabular-nums outline-none ring-1 ring-[var(--border)] transition-[box-shadow,ring-color] duration-150 focus:bg-[var(--background)] focus:ring-2 focus:ring-[var(--primary)]/50"
          : "h-12 w-full rounded-lg border-0 bg-[var(--muted)]/40 px-3 text-right text-xl font-bold tabular-nums outline-none ring-1 ring-[var(--border)] transition-[box-shadow,ring-color] duration-150 focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/40"
      }
    />
  );

  const mobileEditor =
    editing && isMobile ? (
      <Sheet
        open={editing}
        onOpenChange={(open) => {
          if (!open) cancelEditing();
        }}
      >
        <SheetContent hideClose className="gap-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-0 pb-1 pt-1">
            <SheetTitle className="text-base">Editar valor</SheetTitle>
            <SheetDescription className="text-sm">{label}</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-5 pt-2">
            {moneyInput}
            {onAudit ? (
              <button
                type="button"
                className="w-full text-center text-sm font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                onClick={() => {
                  cancelEditing();
                  onAudit();
                }}
              >
                Ver detalhamento
              </button>
            ) : null}
            {adjusted && onRestore ? (
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-200"
                onClick={() => {
                  cancelEditing();
                  onRestore();
                }}
              >
                <Undo2 className="size-3.5" aria-hidden />
                Restaurar valor do sync
              </button>
            ) : null}
          </SheetBody>
          <SheetFooter className="grid grid-cols-2 gap-2 border-t-0 pt-0 sm:flex">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-xl text-base font-semibold"
              onClick={() => cancelEditing()}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-12 rounded-xl text-base font-semibold"
              onClick={() => commit(draft)}
            >
              Aplicar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    ) : null;

  if (editing && !isMobile) {
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
              <div
                className={cn(
                  "rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl ring-1 ring-black/5 transition-[opacity,transform] duration-200 ease-out",
                  panelEntered
                    ? "scale-100 opacity-100"
                    : "scale-95 opacity-0",
                )}
              >
                <p className="mb-2 truncate text-xs font-medium text-[var(--muted-foreground)]">
                  {label}
                </p>
                {moneyInput}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 text-sm font-semibold"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => cancelEditing()}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="h-10 text-sm font-semibold"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(draft)}
                  >
                    Aplicar
                  </Button>
                </div>
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
    : isMobile
      ? `Toque para editar ${label}`
      : onAudit
        ? `Clique para auditar · Duplo-clique para editar ${label}`
        : `Duplo-clique para editar ${label}`;

  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-1">
      {leading}
      <span
        role={disabled && !onAudit ? undefined : "button"}
        tabIndex={disabled && !onAudit ? undefined : 0}
        className={cn(
          "whitespace-nowrap text-[12.5px] font-bold tabular-nums leading-tight",
          muted && "text-[var(--muted-foreground)]",
          adjusted && "text-amber-900 dark:text-amber-200",
          (!disabled || onAudit) &&
            "cursor-pointer rounded-sm hover:bg-[var(--muted)]",
          onAudit &&
            !isMobile &&
            "underline decoration-dotted decoration-1 underline-offset-2",
        )}
        title={
          title ??
          (adjusted
            ? `${defaultTitle ?? label} (ajustado manualmente)`
            : defaultTitle)
        }
        onClick={(e) => {
          e.stopPropagation();
          // Mobile: toque abre edição (ou auditoria se não editável).
          if (isMobile) {
            clearClickTimer();
            if (!disabled) {
              startEditing();
              return;
            }
            onAudit?.();
            return;
          }
          if (!onAudit) return;
          clearClickTimer();
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null;
            onAudit();
          }, 280);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isMobile) return;
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
      {adjusted ? <AdjustedBadge onRestore={onRestore} /> : null}
      {trailing}
      {mobileEditor}
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
  | "adsCost"
  | "partialReturns"
  | "returnFee"
  | "specialFees"
  | "fullShipping"
  | "fullStorage"
  | "fullNonCompliance"
  | "minhaPagina"
  | "affiliateFee";
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
  partialReturnsMl: "partialReturns",
  returnFeeMl: "returnFee",
  specialFeesMl: "specialFees",
  fullShippingMl: "fullShipping",
  fullStorageMl: "fullStorage",
  fullNonComplianceMl: "fullNonCompliance",
  minhaPaginaMl: "minhaPagina",
  affiliateFeeMl: "affiliateFee",
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
    rowLabel: "Canceladas / devolvidas",
    amountLabel: "Valor cancelado/devolvido",
    description:
      "Soma do valor bruto de cada pedido cancelado ou devolvido no mês, por anúncio/SKU.",
  },
  saleFee: {
    rowLabel: "Tarifa ML",
    amountLabel: "Tarifa",
    description:
      "Tarifas de venda da fatura ML (por label da cobrança) ou, se o mês foi estimado pelos pedidos, por anúncio/SKU.",
  },
  sellerShipping: {
    rowLabel: "Frete vendedor",
    amountLabel: "Frete",
    description:
      "Frete da fatura ML (por label) ou, se estimado pelos pedidos, por anúncio/SKU.",
  },
  adsCost: {
    rowLabel: "Campanhas ADS",
    amountLabel: "Gasto ADS",
    description:
      "Gasto com campanhas de Product Ads no mês, por anúncio.",
  },
  partialReturns: {
    rowLabel: "Devoluções parciais",
    amountLabel: "Valor",
    description:
      "Reembolsos parciais da fatura ML, agrupados pelo label da cobrança.",
  },
  returnFee: {
    rowLabel: "Tarifa de devolução",
    amountLabel: "Tarifa",
    description:
      "Tarifas de devolução da fatura ML (e estornos), por label da cobrança.",
  },
  specialFees: {
    rowLabel: "Tarifas especiais",
    amountLabel: "Tarifa",
    description:
      "Cobranças especiais da fatura ML (DIFAL, CDLIT e correlatas), por label. A planilha Por Vendas não traz esse agrupamento.",
  },
  fullShipping: {
    rowLabel: "Full envios",
    amountLabel: "Custo",
    description: "Tarifas de envio Full da conciliação ML.",
  },
  fullStorage: {
    rowLabel: "Full armazém",
    amountLabel: "Custo",
    description: "Cobrança de armazenamento Full no mês.",
  },
  fullNonCompliance: {
    rowLabel: "Full inconform.",
    amountLabel: "Custo",
    description: "Multas por inconformidade no envio ao Full.",
  },
  minhaPagina: {
    rowLabel: "Minha Página",
    amountLabel: "Tarifa",
    description: "Tarifa de manutenção da Minha Página / E-Shop.",
  },
  affiliateFee: {
    rowLabel: "Comissão Afiliados",
    amountLabel: "Comissão",
    description: "Comissão paga a afiliados.",
  },
};

/** Link para o painel "Tarifas e investimentos" do ML, só para "Tarifas especiais" de um mês específico (não para o total do ano). */
function buildSpecialFeesExternalLink(
  year: number,
  auditTarget: AuditTarget,
): { href: string; label: string; hint: string } | null {
  if (
    auditTarget === null ||
    auditTarget.kind !== "specialFees" ||
    auditTarget.period === "year"
  ) {
    return null;
  }
  return {
    href: buildMercadoLivreCostsMetricsUrl(year, auditTarget.period),
    label: "Abrir métricas de custos no Mercado Livre",
    hint: "Para conferir o valor exato de \"Outras Tarifas\": no painel do Mercado Livre, vá em Tarifas e investimentos e passe o mouse sobre a linha \"Outras Tarifas\".",
  };
}

const LINE_BREAKDOWN_FIELD: Partial<
  Record<AuditKind, keyof DreMonthView>
> = {
  revenue: "revenueBreakdown",
  cancelledSales: "cancelledSalesBreakdown",
  saleFee: "saleFeeBreakdown",
  sellerShipping: "sellerShippingBreakdown",
  adsCost: "adsCostBreakdown",
  partialReturns: "partialReturnsBreakdown",
  returnFee: "returnFeeBreakdown",
  specialFees: "specialFeesBreakdown",
  fullShipping: "fullShippingBreakdown",
  fullStorage: "fullStorageBreakdown",
  fullNonCompliance: "fullNonComplianceBreakdown",
  minhaPagina: "minhaPaginaBreakdown",
  affiliateFee: "affiliateFeeBreakdown",
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

  const cancelledHint =
    row.type === "static" && row.id === "cancelledSalesMl"
      ? row.methodology
      : undefined;
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
          <TooltipContent side="right" align="start" className="max-w-xs">
            <p>Fonte: {sourceOriginLabel(source)}</p>
            {cancelledHint ? (
              <p className="mt-1.5">{cancelledHint}</p>
            ) : null}
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
  onNonOperationalOutChange: DreYearTableProps["onNonOperationalOutChange"],
  onNonOperationalInChange: DreYearTableProps["onNonOperationalInChange"],
  onAuditClick?: (kind: AuditKind, month: number) => void,
  onEditingChange?: (editing: boolean, month: number, rowId: string) => void,
  onLineRestore?: DreYearTableProps["onLineRestore"],
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

  if (row.type === "non-operational-out-cost") {
    const stored = month.nonOperationalOutValues[row.costItemId];
    const override = month.nonOperationalOutOverrides[row.costItemId];
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
          onNonOperationalOutChange(
            row.costItemId,
            month.month,
            amount === null ? null : Math.abs(amount),
          )
        }
      />
    );
  }

  if (row.type === "non-operational-in-cost") {
    const stored = month.nonOperationalInValues[row.costItemId];
    const override = month.nonOperationalInOverrides[row.costItemId];
    const displayAmount = stored === null || stored === undefined ? null : stored;
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
          onNonOperationalInChange(
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
    "whitespace-nowrap text-center text-[13px] tabular-nums leading-tight",
    colored ? "font-semibold text-[var(--foreground)]" : "font-medium",
  );

  const editableKey = getEditableLineKey(row);
  const auditKind = getAuditKindForRow(row);
  const isAdjusted =
    editableKey !== null &&
    month.manuallyEditedLineKeys.includes(editableKey);
  const canRestore =
    isAdjusted &&
    editableKey !== null &&
    month.syncedLineBaselineKeys.includes(editableKey) &&
    Boolean(onLineRestore);

  if (editableKey && canEditMonth) {
    return (
      <div className={cn(valueClassName, "inline-flex items-center justify-center gap-1.5")}>
        <DreInlineMoneyCell
          displayAmount={amount}
          label={`${row.label} (${month.label})`}
          allowNegative={editableKey !== "revenueMl"}
          adjusted={isAdjusted}
          onAudit={
            auditKind && onAuditClick
              ? () => onAuditClick(auditKind, month.month)
              : undefined
          }
          onRestore={
            canRestore
              ? () => onLineRestore!(editableKey, month.month)
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
      <div
        role={auditable ? "button" : undefined}
        tabIndex={auditable ? 0 : undefined}
        className={cn(
          auditable &&
            "cursor-pointer rounded-sm underline decoration-dotted decoration-1 underline-offset-2 hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
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
      {isAdjusted ? (
        <AdjustedBadge
          onRestore={
            canRestore
              ? () => onLineRestore!(editableKey!, month.month)
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

/** Envolve `node` com um tooltip "X% do faturamento" no hover — usado em toda célula de valor, não só nas 3 linhas de resultado que já mostram % fixo. */
function withRevenuePercentTooltip(
  node: ReactNode,
  amount: number | null | undefined,
  revenue: number | null | undefined,
): ReactNode {
  if (amount == null || revenue == null || revenue <= 0) return node;
  const percent = percentOfRevenue(amount, revenue);
  if (percent === null) return node;
  return (
    <Tooltip>
      {/* "asChild" clona esse span e o Radix mede sua posição via
          getBoundingClientRect para ancorar o tooltip — display:contents
          faz o elemento não gerar caixa própria, e o Radix não acha onde
          ancorar (tooltip cai no canto superior esquerdo da página).
          inline-block preserva a geometria sem afetar o fluxo ao redor. */}
      <TooltipTrigger asChild>
        <span className="inline-block max-w-full">{node}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {formatFinancialPercent(percent)} do faturamento
      </TooltipContent>
    </Tooltip>
  );
}

function renderPercentCell(percent: number | null) {
  return (
    <div
      className={cn(
        "whitespace-nowrap text-center text-[11px] font-medium tabular-nums leading-tight",
        valueToneClass(percent),
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

  if (row.type === "non-operational-out-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.nonOperationalOutValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return { amount: hasAny ? -sum : null, percent: null };
  }

  if (row.type === "non-operational-in-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.nonOperationalInValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return { amount: hasAny ? sum : null, percent: null };
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
    case "totalSaidaNaoOperacional":
      return { amount: totals.totalSaidaNaoOperacional, percent: null };
    case "totalEntradaNaoOperacional":
      return { amount: totals.totalEntradaNaoOperacional, percent: null };
    case "resultadoLiquido":
      return {
        amount: totals.resultadoLiquido,
        percent: totals.resultadoLiquidoPercent,
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
  onLineRestore,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
  onNonOperationalOutChange,
  onNonOperationalInChange,
  onAuditClick,
}: {
  row: DreTableRow;
  isAlt: boolean;
  selection: DreMobileSelection;
  data: DreYearView;
  onLineChange: DreYearTableProps["onLineChange"];
  onLineRestore?: DreYearTableProps["onLineRestore"];
  onFixedCostChange: DreYearTableProps["onFixedCostChange"];
  onOperationalCostChange: DreYearTableProps["onOperationalCostChange"];
  onInvestmentCostChange: DreYearTableProps["onInvestmentCostChange"];
  onNonOperationalOutChange: DreYearTableProps["onNonOperationalOutChange"];
  onNonOperationalInChange: DreYearTableProps["onNonOperationalInChange"];
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
        colored ? "font-semibold text-[var(--foreground)]" : "",
      )}
    >
      <div
        role={auditKind ? "button" : undefined}
        tabIndex={auditKind ? 0 : undefined}
        className={cn(
          "whitespace-nowrap text-center text-[13px] font-bold tabular-nums leading-tight",
          auditKind &&
            "cursor-pointer rounded-sm underline decoration-dotted decoration-1 underline-offset-2 hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
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
      onNonOperationalOutChange,
      onNonOperationalInChange,
      (kind, m) => onAuditClick(kind, m),
      undefined,
      onLineRestore,
    )
  );

  const percent = isTotal
    ? getYearTotalForRow(row, data).percent
    : getCellValue(row, month!).percent;
  const revenueAmount = isTotal
    ? getYearTotalForRow(row, data).amount
    : getCellValue(row, month!).amount;
  const revenueBase = isTotal
    ? data.yearTotals?.totalEntrada
    : month?.totals?.totalEntrada;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg px-3 py-2.5",
        colored ? bg : isAlt ? "bg-[var(--muted)]/25" : "bg-transparent",
      )}
    >
      <div className="min-w-0 flex-1">{renderLabelCell(row)}</div>
      <div className="shrink-0 text-right">
        {withRevenuePercentTooltip(valueNode, revenueAmount, revenueBase)}
        {showPercentRow ? (
          <div className="mt-0.5">{renderPercentCell(percent)}</div>
        ) : null}
      </div>
    </div>
  );
}

function DreYearTableMobile({
  data,
  visibility = DEFAULT_DRE_VISIBILITY,
  showDetails,
  onToggleDetails,
  onSelectedMonthChange,
  syncingMonths,
  syncingMonthMessages = {},
  onSyncMonth,
  onLineChange,
  onLineRestore,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
  onNonOperationalOutChange,
  onNonOperationalInChange,
}: DreYearTableProps) {
  const rows = useMemo(
    () =>
      filterRowsByVisibility(
        buildDreTableRows(
          data.costItems,
          data.operationalCostItems,
          data.investmentCostItems,
          data.nonOperationalOutItems,
          data.nonOperationalInItems,
          true,
        ),
        visibility,
      ),
    [
      data.costItems,
      data.operationalCostItems,
      data.investmentCostItems,
      data.nonOperationalOutItems,
      data.nonOperationalInItems,
      visibility,
    ],
  );

  const detailIndexById = useMemo(() => buildDetailIndexMap(rows), [rows]);
  const detailCount = detailIndexById.size;

  const altRowFlags = useMemo(
    () => altRowFlagsForView(rows, showDetails),
    [rows, showDetails],
  );

  const defaultIndex = useMemo(() => {
    const currentIdx = data.months.findIndex((m) => m.isCurrentMonth);
    if (currentIdx >= 0) return currentIdx;
    return Math.max(0, data.months.length - 1);
  }, [data.months]);

  const [selection, setSelection] = useState<DreMobileSelection>(defaultIndex);
  const [auditTarget, setAuditTarget] = useState<AuditTarget>(null);

  function updateSelection(next: DreMobileSelection) {
    setSelection(next);
    if (!onSelectedMonthChange) return;
    if (next === "total") {
      onSelectedMonthChange(null);
      return;
    }
    onSelectedMonthChange(data.months[next]?.month ?? null);
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
  const specialFeesExternalLink = buildSpecialFeesExternalLink(
    data.year,
    auditTarget,
  );

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
    const base = selection === "total" ? data.months.length : selection;
    const next = base + offset;
    if (next < 0) {
      updateSelection(0);
      return;
    }
    if (next >= data.months.length) {
      updateSelection("total");
      return;
    }
    updateSelection(next);
  }

  return (
    <div className="space-y-3">
      {onToggleDetails ? (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant={showDetails ? "secondary" : "default"}
            size="sm"
            className="h-8 cursor-pointer text-xs font-semibold shadow-sm"
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
          className="cursor-pointer"
          aria-label="Período anterior"
          disabled={selection === 0}
          onClick={() => goToOffset(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <FormSelect
          value={String(selection)}
          onValueChange={(value) =>
            updateSelection(value === "total" ? "total" : Number(value))
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
          className="cursor-pointer"
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
              className="ml-auto cursor-pointer gap-1.5"
              disabled={syncingMonths.has(selectedMonth.month)}
              title={
                syncingMonths.has(selectedMonth.month)
                  ? (syncingMonthMessages[selectedMonth.month] ??
                    "Sincronizando…")
                  : undefined
              }
              onClick={() => onSyncMonth(selectedMonth.month)}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  syncingMonths.has(selectedMonth.month) && "animate-spin",
                )}
                aria-hidden
              />
              {syncingMonths.has(selectedMonth.month)
                ? (syncingMonthMessages[selectedMonth.month] ??
                  "Sincronizando…")
                : "Sincronizar"}
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

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {rows.map((row, index) => {
          const detail = isDetailRow(row);
          const rowNode = (
            <DreMobileRow
              row={row}
              isAlt={altRowFlags[index]}
              selection={selection}
              data={data}
              onLineChange={onLineChange}
              onLineRestore={onLineRestore}
              onFixedCostChange={onFixedCostChange}
              onOperationalCostChange={onOperationalCostChange}
              onInvestmentCostChange={onInvestmentCostChange}
              onNonOperationalOutChange={onNonOperationalOutChange}
              onNonOperationalInChange={onNonOperationalInChange}
              onAuditClick={(kind, period) => setAuditTarget({ kind, period })}
            />
          );

          if (!detail) {
            return <Fragment key={row.id}>{rowNode}</Fragment>;
          }

          const detailIndex = detailIndexById.get(row.id) ?? 0;
          return (
            <div
              key={row.id}
              className={cn(
                "grid transition-[grid-template-rows] motion-reduce:transition-none motion-reduce:delay-0",
                showDetails ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                !showDetails && "![border-top-width:0px]",
              )}
              style={detailRevealStyle(detailIndex, detailCount, showDetails)}
              aria-hidden={!showDetails}
            >
              <div
                className={cn(
                  "overflow-hidden transition-opacity motion-reduce:transition-none motion-reduce:delay-0",
                  showDetails ? "opacity-100" : "opacity-0",
                )}
                style={detailRevealStyle(detailIndex, detailCount, showDetails)}
              >
                {rowNode}
              </div>
            </div>
          );
        })}
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
        externalLink={specialFeesExternalLink}
        onClose={() => setAuditTarget(null)}
      />
    </div>
  );
}

function MonthHeaderCell({
  year,
  month,
  syncing,
  syncMessage,
  selected,
  dimmed,
  onSync,
  onToggleSelect,
}: {
  year: number;
  month: DreMonthView;
  syncing: boolean;
  syncMessage?: string;
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
          : "bg-[var(--card)] hover:bg-[var(--muted)]/50",
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
              "cursor-pointer text-[11px] font-semibold tracking-wide text-[var(--muted-foreground)]",
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
            aria-label={
              syncing
                ? `Sincronizando ${month.label}: ${syncMessage ?? "em andamento"}`
                : `Sincronizar ${month.label}`
            }
            title={
              syncing
                ? (syncMessage ?? "Sincronizando…")
                : `Sincronizar ${month.label}`
            }
            disabled={syncing}
            onClick={(e) => {
              e.stopPropagation();
              onSync();
            }}
          >
            <RefreshCw
              className={cn("size-3", syncing && "animate-spin")}
              aria-hidden
            />
          </Button>
        ) : null}
      </div>
    </th>
  );
}

function DreLayoutToggle({
  layout,
  onChange,
}: {
  layout: "statement" | "year";
  onChange: (layout: "statement" | "year") => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-[var(--muted)] p-1">
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          layout === "statement"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
        onClick={() => onChange("statement")}
      >
        <List className="size-3.5" aria-hidden />
        Demonstrativo
      </button>
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          layout === "year"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
        onClick={() => onChange("year")}
      >
        <Columns3 className="size-3.5" aria-hidden />
        Comparar meses
      </button>
    </div>
  );
}

type DrePieDisplayMode = "both" | "percent" | "value";

const PIE_DISPLAY_OPTIONS: Array<{ value: DrePieDisplayMode; label: string }> = [
  { value: "both", label: "R$ e %" },
  { value: "percent", label: "Só %" },
  { value: "value", label: "Só R$" },
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Caminho de uma fatia de rosca (donut) entre dois ângulos, em graus. */
function donutSlicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

/** Reduz a fonte do valor central do donut conforme o texto formatado cresce, pra nunca estourar o buraco. */
function pieCenterValueSizeClass(formatted: string): string {
  if (formatted.length > 14) return "text-[10px] sm:text-xs";
  if (formatted.length > 10) return "text-xs sm:text-sm";
  return "text-sm sm:text-base";
}

/**
 * Gráfico de rosca: Custos Variáveis, Custo Fixo, Investimentos e Lucro
 * Operacional como fatias — cada uma proporcional ao próprio valor absoluto
 * (não à Entrada), para funcionar mesmo em prejuízo. O centro mostra a
 * Entrada; a legenda ao lado tem um alternador pra ver só valor, só % (da
 * receita) ou os dois.
 */
function DreRevenuePie({
  totals,
  visibility = DEFAULT_DRE_VISIBILITY,
}: {
  totals: DreComputedTotals | null | undefined;
  visibility?: DreVisibilitySettings;
}) {
  const [mode, setMode] = useState<DrePieDisplayMode>("both");
  const base = totals?.totalEntrada ?? null;

  if (!totals || base == null || base <= 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
        Sem dados suficientes para o período.
      </div>
    );
  }

  const lucro = totals.lucroOperacional;
  const isLoss = lucro < 0;

  const rawItems = [
    {
      id: "totalCustoOperacional",
      label: "Custos Variáveis",
      value: totals.totalCustoOperacional,
      icon: Receipt,
      fillClass: "fill-rose-500",
      dotClass: "bg-rose-500",
    },
    {
      id: "totalCustoFixo",
      label: "Custo Fixo",
      value: totals.totalCustoFixo,
      icon: Landmark,
      fillClass: "fill-slate-400",
      dotClass: "bg-slate-400",
    },
    ...(visibility.showInvestments
      ? [
          {
            id: "totalInvestimento",
            label: "Investimentos",
            value: totals.totalInvestimento,
            icon: Rocket,
            fillClass: "fill-sky-400",
            dotClass: "bg-sky-400",
          },
        ]
      : []),
    {
      id: "lucroOperacional",
      label: "Lucro Operacional",
      value: lucro,
      icon: TrendingUp,
      fillClass: isLoss ? "fill-amber-500" : "fill-emerald-500",
      dotClass: isLoss ? "bg-amber-500" : "bg-emerald-500",
    },
  ];

  const weights = rawItems.map((item) => Math.abs(item.value));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

  const slices = rawItems.reduce<
    Array<
      (typeof rawItems)[number] & {
        percent: number;
        startAngle: number;
        endAngle: number;
        fraction: number;
      }
    >
  >((acc, item, index) => {
    const previousEnd = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
    const fraction = weights[index] / totalWeight;
    const startAngle = previousEnd;
    const endAngle = Math.min(360, startAngle + fraction * 360);
    acc.push({
      ...item,
      percent: (item.value / base) * 100,
      startAngle,
      endAngle: Math.min(endAngle, startAngle + 359.9),
      fraction,
    });
    return acc;
  }, []);

  const showValue = mode !== "percent";
  const showPercent = mode !== "value";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-[var(--muted-foreground)]">
          Visão geral do período
        </p>
        <div className="inline-flex rounded-full bg-[var(--muted)] p-1">
          {PIE_DISPLAY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                mode === option.value
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative shrink-0">
          <svg viewBox="0 0 200 200" className="size-44 sm:size-48" aria-hidden>
            {slices
              .filter((slice) => slice.fraction > 0)
              .map((slice) => (
                <Tooltip key={slice.id}>
                  <TooltipTrigger asChild>
                    <path
                      d={donutSlicePath(
                        100,
                        100,
                        94,
                        66,
                        slice.startAngle,
                        slice.endAngle,
                      )}
                      className={cn(
                        slice.fillClass,
                        "cursor-default transition-[filter] duration-150 hover:brightness-110",
                      )}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p className="font-semibold">{slice.label}</p>
                    <p className="mt-0.5 font-semibold tabular-nums">
                      {formatFinancialMoney(slice.value)} ·{" "}
                      {formatFinancialPercent(slice.percent)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
          </svg>
          <div
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 flex w-[62%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center overflow-hidden px-1",
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Entrada
            </p>
            <p
              className={cn(
                "w-full truncate text-center font-bold tabular-nums text-[var(--foreground)]",
                pieCenterValueSizeClass(formatFinancialMoney(base)),
              )}
            >
              {formatFinancialMoney(base)}
            </p>
          </div>
        </div>

        <div className="w-full flex-1 space-y-1">
          {slices.map((slice) => {
            const Icon = slice.icon;
            return (
              <div
                key={slice.id}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--muted)]/40"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn("size-2.5 shrink-0 rounded-full", slice.dotClass)}
                    aria-hidden
                  />
                  <Icon
                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden
                  />
                  <span className="truncate text-sm text-[var(--foreground)]">
                    {slice.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-baseline gap-2">
                  {showValue ? (
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        valueToneClass(slice.value),
                      )}
                    >
                      {formatFinancialMoney(slice.value)}
                    </span>
                  ) : null}
                  {showPercent ? (
                    <span className="tabular-nums text-xs text-[var(--muted-foreground)]">
                      {formatFinancialPercent(slice.percent)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isLoss ? (
        <div className="mt-3 flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          Prejuízo operacional: {formatFinancialMoney(lucro)} (
          {formatFinancialPercent((lucro / base) * 100)})
        </div>
      ) : null}
    </div>
  );
}

interface StatementGroup {
  header: DreTableRow;
  items: DreTableRow[];
}

/**
 * Agrupa as linhas planas do DRE em blocos por seção (Entrada, Custos
 * Variáveis, Custo Fixo, Investimentos). Linhas "resultado" (margem, lucro
 * antes dos investimentos, lucro operacional) fecham o grupo atual sem virar
 * um cartão — esses totais já aparecem, com destaque, na ponte visual acima.
 */
function buildStatementGroups(rows: DreTableRow[]): StatementGroup[] {
  const groups: StatementGroup[] = [];
  let current: StatementGroup | null = null;
  for (const row of rows) {
    const kind = row.type === "static" ? row.kind : "custo-detail";
    if (kind === "entrada-total" || kind === "custo-total") {
      current = { header: row, items: [] };
      groups.push(current);
      continue;
    }
    if (kind === "resultado") {
      current = null;
      continue;
    }
    if (current) current.items.push(row);
  }
  return groups;
}

const GROUP_VISUALS: Partial<
  Record<DreStaticRowId, { icon: typeof TrendingUp; tone: string }>
> = {
  totalEntrada: { icon: Banknote, tone: "primary" },
  totalCustoOperacional: { icon: Receipt, tone: "rose" },
  totalCustoFixo: { icon: Landmark, tone: "amber" },
  totalInvestimento: { icon: Rocket, tone: "violet" },
  totalSaidaNaoOperacional: { icon: TrendingDown, tone: "rose" },
  totalEntradaNaoOperacional: { icon: PiggyBank, tone: "emerald" },
};

const GROUP_TONE_CLASS: Record<string, string> = {
  primary: "bg-[var(--primary)]/10 text-[var(--primary)]",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

function DreStatementPanel({
  data,
  visibility = DEFAULT_DRE_VISIBILITY,
  showDetails,
  selectedMonth,
  syncingMonths,
  syncingMonthMessages,
  onSyncMonth,
  onLineChange,
  onLineRestore,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
  onNonOperationalOutChange,
  onNonOperationalInChange,
  onAuditClick,
  onEditingChange,
}: {
  data: DreYearView;
  visibility?: DreVisibilitySettings;
  showDetails: boolean;
  selectedMonth: number | null;
  syncingMonths: Set<number>;
  syncingMonthMessages: Record<number, string>;
  onSyncMonth: (month: number) => void;
  onLineChange: DreYearTableProps["onLineChange"];
  onLineRestore?: DreYearTableProps["onLineRestore"];
  onFixedCostChange: DreYearTableProps["onFixedCostChange"];
  onOperationalCostChange: DreYearTableProps["onOperationalCostChange"];
  onInvestmentCostChange: DreYearTableProps["onInvestmentCostChange"];
  onNonOperationalOutChange: DreYearTableProps["onNonOperationalOutChange"];
  onNonOperationalInChange: DreYearTableProps["onNonOperationalInChange"];
  onAuditClick: (kind: AuditKind, period: number | "year") => void;
  onEditingChange?: (editing: boolean, month: number, rowId: string) => void;
}) {
  const rows = useMemo(
    () =>
      filterRowsByVisibility(
        buildDreTableRows(
          data.costItems,
          data.operationalCostItems,
          data.investmentCostItems,
          data.nonOperationalOutItems,
          data.nonOperationalInItems,
          true,
        ),
        visibility,
      ),
    [
      data.costItems,
      data.operationalCostItems,
      data.investmentCostItems,
      data.nonOperationalOutItems,
      data.nonOperationalInItems,
      visibility,
    ],
  );
  const groups = useMemo(() => buildStatementGroups(rows), [rows]);
  const month =
    selectedMonth !== null
      ? (data.months.find((m) => m.month === selectedMonth) ?? null)
      : null;
  const isYear = month === null;
  const alertMessages = month ? getMonthAlertMessages(month) : [];
  const totals = isYear ? data.yearTotals : month.totals;

  function renderDetailRow(row: DreTableRow) {
    const { amount, percent } = isYear
      ? getYearTotalForRow(row, data)
      : getCellValue(row, month as DreMonthView);
    const auditKind = getAuditKindForRow(row);

    return (
      <div
        key={row.id}
        className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-[var(--muted)]/40"
      >
        <div className="min-w-0 flex-1">{renderLabelCell(row)}</div>
        <div className="flex shrink-0 flex-col items-end">
          {withRevenuePercentTooltip(
            isYear ? (
              <div
                role={auditKind ? "button" : undefined}
                tabIndex={auditKind ? 0 : undefined}
                className={cn(
                  "whitespace-nowrap text-right text-[15px] font-medium tabular-nums leading-tight",
                  valueToneClass(amount),
                  auditKind &&
                    "cursor-pointer rounded-md px-1 hover:bg-[var(--muted)]",
                )}
                onClick={
                  auditKind ? () => onAuditClick(auditKind, "year") : undefined
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
                {formatFinancialMoney(amount)}
              </div>
            ) : (
              <div className="[&_.inline-flex]:justify-end">
                {renderValueCell(
                  row,
                  month as DreMonthView,
                  onLineChange,
                  onFixedCostChange,
                  onOperationalCostChange,
                  onInvestmentCostChange,
                  onNonOperationalOutChange,
                  onNonOperationalInChange,
                  (kind, m) => onAuditClick(kind, m),
                  onEditingChange,
                  onLineRestore,
                )}
              </div>
            ),
            amount,
            totals?.totalEntrada,
          )}
          {percent != null && Math.abs(percent) > 0 ? (
            <div
              className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-[var(--muted)]"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-[var(--primary)]/45"
                style={{ width: `${Math.min(100, Math.abs(percent))}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const groupIds = useMemo(() => groups.map((g) => g.header.id), [groups]);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [columnOf, setColumnOf] = useState<Record<string, number>>({});

  /**
   * Masonry real: mede a altura de cada cartão já renderizado e distribui
   * greedy — sempre para a coluna mais curta no momento. Se um cartão
   * grande cresce, os seguintes migram de coluna; caso contrário eles se
   * empilham direto atrás do cartão anterior daquela coluna.
   */
  useLayoutEffect(() => {
    const heights = groupIds.map(
      (id) => cardRefs.current.get(id)?.offsetHeight ?? 0,
    );
    const colHeights = [0, 0];
    const next: Record<string, number> = {};
    groupIds.forEach((id, index) => {
      const col = colHeights[0] <= colHeights[1] ? 0 : 1;
      next[id] = col;
      colHeights[col] += heights[index];
    });
    setColumnOf((prev) => {
      const changed = groupIds.some((id) => prev[id] !== next[id]);
      return changed ? next : prev;
    });
  }, [groupIds, showDetails, isYear, month?.month]);

  return (
    <div className="px-4 py-5 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Demonstrativo
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {month ? month.label : `Ano ${data.year}`}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {isYear
              ? "Totais do ano. Escolha um mês nas pílulas acima para editar valores."
              : `Sync: ${formatSyncTime(month.syncedAt)}`}
          </p>
        </div>
        {month?.canSync ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 cursor-pointer gap-1.5 rounded-full"
            disabled={syncingMonths.has(month.month)}
            onClick={() => onSyncMonth(month.month)}
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                syncingMonths.has(month.month) && "animate-spin",
              )}
              aria-hidden
            />
            {syncingMonths.has(month.month)
              ? (syncingMonthMessages[month.month] ?? "Sincronizando…")
              : "Sincronizar mês"}
          </Button>
        ) : null}
      </div>
      {alertMessages.length > 0 ? (
        <p className="mb-4 flex items-start gap-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {alertMessages[0]}
        </p>
      ) : null}

      <div className="space-y-3">
        <DreRevenuePie totals={totals} visibility={visibility} />

        <div className="mx-auto grid max-w-3xl items-start gap-2.5 sm:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            {groups
              .filter(
                (group, index) => (columnOf[group.header.id] ?? index % 2) === 0,
              )
              .map((group) => renderStatementGroup(group))}
          </div>
          <div className="flex flex-col gap-2.5">
            {groups
              .filter(
                (group, index) => (columnOf[group.header.id] ?? index % 2) === 1,
              )
              .map((group) => renderStatementGroup(group))}
          </div>
        </div>
      </div>
    </div>
  );

  function renderStatementGroup(group: StatementGroup) {
    const visual =
      group.header.type === "static"
        ? GROUP_VISUALS[group.header.id]
        : undefined;
    const Icon = visual?.icon ?? TrendingUp;
    const { amount: headerAmount } = isYear
      ? getYearTotalForRow(group.header, data)
      : getCellValue(group.header, month as DreMonthView);

    return (
      <div
        key={group.header.id}
        ref={(el) => {
          if (el) cardRefs.current.set(group.header.id, el);
          else cardRefs.current.delete(group.header.id);
        }}
        className="overflow-hidden rounded-2xl border border-[var(--border)]"
      >
        <div className="flex items-center justify-between gap-3 bg-[var(--muted)]/40 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                GROUP_TONE_CLASS[visual?.tone ?? "primary"],
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <p className="truncate text-sm font-semibold text-[var(--foreground)]">
              {group.header.label}
            </p>
          </div>
          <p
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              valueToneClass(headerAmount),
            )}
          >
            {formatFinancialMoney(headerAmount)}
          </p>
        </div>
        {showDetails && group.items.length > 0 ? (
          <div className="divide-y divide-[var(--border)]/70">
            {group.items.map((row) => renderDetailRow(row))}
          </div>
        ) : null}
      </div>
    );
  }
}

export function DreYearTable(props: DreYearTableProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DreYearTableMobile key={props.data.year} {...props} />;
  }
  return <DreYearTableDesktop {...props} />;
}

function DreYearTableDesktop({
  data,
  visibility = DEFAULT_DRE_VISIBILITY,
  showDetails,
  onToggleDetails,
  selectedMonth: selectedMonthProp = null,
  onSelectedMonthChange,
  syncingMonths,
  syncingMonthMessages = {},
  onSyncMonth,
  onLineChange,
  onLineRestore,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
  onNonOperationalOutChange,
  onNonOperationalInChange,
}: DreYearTableProps) {
  const [selectedMonthLocal, setSelectedMonthLocal] = useState<number | null>(
    null,
  );
  const selectedMonth =
    onSelectedMonthChange !== undefined
      ? (selectedMonthProp ?? null)
      : selectedMonthLocal;
  function setSelectedMonth(next: number | null) {
    if (onSelectedMonthChange) {
      onSelectedMonthChange(next);
      return;
    }
    setSelectedMonthLocal(next);
  }
  /** Célula em edição — esmaece TODO o restante do DRE, inclusive a coluna atual. */
  const [editingCell, setEditingCell] = useState<{
    month: number;
    rowId: string;
  } | null>(null);
  const [layout, setLayout] = useState<"statement" | "year">("statement");
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
  const specialFeesExternalLink = buildSpecialFeesExternalLink(
    data.year,
    auditTarget,
  );

  const rows = filterRowsByVisibility(
    buildDreTableRows(
      data.costItems,
      data.operationalCostItems,
      data.investmentCostItems,
      data.nonOperationalOutItems,
      data.nonOperationalInItems,
      true,
    ),
    visibility,
  );
  const detailIndexById = buildDetailIndexMap(rows);
  const detailCount = detailIndexById.size;

  // Zebra striping só entre as linhas "brancas" visíveis — detalhes colapsados
  // não entram na contagem.
  const altRowFlags = altRowFlagsForView(rows, showDetails);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <DreLayoutToggle layout={layout} onChange={setLayout} />
          {onToggleDetails ? (
            <div className="flex items-center gap-3">
            <p className="hidden text-xs text-[var(--muted-foreground)] sm:block">
              {showDetails
                ? "Linhas detalhadas visíveis"
                : "Só totais e resultados"}
            </p>
            <Button
              type="button"
              variant={showDetails ? "outline" : "default"}
              size="sm"
              className="h-8 shrink-0 cursor-pointer rounded-full text-[11px] font-medium"
              onClick={onToggleDetails}
            >
              {showDetails ? "Ocultar detalhes" : "Mostrar detalhes"}
            </Button>
            </div>
          ) : null}
        </div>
        {layout === "statement" ? (
            <DreStatementPanel
              data={data}
              visibility={visibility}
              showDetails={showDetails}
              selectedMonth={selectedMonth}
              syncingMonths={syncingMonths}
              syncingMonthMessages={syncingMonthMessages}
              onSyncMonth={onSyncMonth}
              onLineChange={onLineChange}
              onLineRestore={onLineRestore}
              onFixedCostChange={onFixedCostChange}
              onOperationalCostChange={onOperationalCostChange}
              onInvestmentCostChange={onInvestmentCostChange}
              onNonOperationalOutChange={onNonOperationalOutChange}
              onNonOperationalInChange={onNonOperationalInChange}
              onAuditClick={(kind, period) =>
                setAuditTarget({ kind, period })
              }
              onEditingChange={(editing, m, rowId) =>
                setEditingCell(editing ? { month: m, rowId } : null)
              }
            />
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] table-fixed border-collapse text-xs">
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
                  "sticky left-0 z-20 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]",
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
                  syncMessage={syncingMonthMessages[month.month]}
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
                    setSelectedMonth(
                      selectedMonth === month.month ? null : month.month,
                    );
                  }}
                />
              ))}
              <th
                className={cn(
                  "border-b border-[var(--border)] bg-[var(--muted)]/40 px-2 py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]",
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
              const detail = isDetailRow(row);
              const detailIndex = detailIndexById.get(row.id) ?? 0;
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
                  <tr
                    className={cn(
                      rowClassName,
                      detail && !showDetails && "pointer-events-none",
                    )}
                    aria-hidden={detail && !showDetails ? true : undefined}
                  >
                    <DetailAnimatedCell
                      isDetail={detail}
                      open={showDetails}
                      detailIndex={detailIndex}
                      detailCount={detailCount}
                      className={cn(
                        "sticky left-0 z-10",
                        !detail && "px-3 py-2",
                        rowClassName,
                        (isEditing || columnFocusMonth !== null) && DIM_CLASS,
                      )}
                      contentClassName="px-3 py-2"
                      style={cellStyle}
                    >
                      {renderLabelCell(row)}
                    </DetailAnimatedCell>
                    {data.months.map((month) => {
                      const editingThis = isEditingThisCell(
                        month.month,
                        row.id,
                      );
                      return (
                        <DetailAnimatedCell
                          key={month.month}
                          isDetail={detail}
                          open={showDetails}
                          detailIndex={detailIndex}
                          detailCount={detailCount}
                          className={cn(
                            !detail && "px-1.5 py-2",
                            "text-center align-middle",
                            editingThis
                              ? cn(
                                  "relative z-30",
                                  SELECTED_MONTH_CELL_CLASS,
                                  bg || "bg-[var(--card)]",
                                )
                              : isEditing
                                ? DIM_CLASS
                                : month.month === columnFocusMonth
                                  ? cn(
                                      SELECTED_MONTH_CELL_CLASS,
                                      bg || "bg-[var(--card)]",
                                    )
                                  : columnFocusMonth !== null && DIM_CLASS,
                          )}
                          contentClassName="px-1.5 py-2 text-center align-middle"
                          style={cellStyle}
                        >
                          {withRevenuePercentTooltip(
                            renderValueCell(
                              row,
                              month,
                              onLineChange,
                              onFixedCostChange,
                              onOperationalCostChange,
                              onInvestmentCostChange,
                              onNonOperationalOutChange,
                              onNonOperationalInChange,
                              (kind, m) =>
                                setAuditTarget({ kind, period: m }),
                              (editing, m, rowId) =>
                                setEditingCell(
                                  editing ? { month: m, rowId } : null,
                                ),
                              onLineRestore,
                            ),
                            getCellValue(row, month).amount,
                            month.totals?.totalEntrada,
                          )}
                        </DetailAnimatedCell>
                      );
                    })}
                    <DetailAnimatedCell
                      isDetail={detail}
                      open={showDetails}
                      detailIndex={detailIndex}
                      detailCount={detailCount}
                      className={cn(
                        !detail && "px-2 py-2",
                        "text-center align-middle",
                        rowClassName,
                        (isEditing || columnFocusMonth !== null) && DIM_CLASS,
                      )}
                      contentClassName="px-2 py-2 text-center align-middle"
                      style={cellStyle}
                    >
                      {withRevenuePercentTooltip(
                        <div
                          className={cn(
                            "inline-flex w-full items-center justify-center gap-1.5",
                            isColoredRow(row)
                              ? "font-semibold text-[var(--foreground)]"
                              : "",
                          )}
                        >
                          <div
                            role={yearAuditKind ? "button" : undefined}
                            tabIndex={yearAuditKind ? 0 : undefined}
                            className={cn(
                              "whitespace-nowrap text-center text-[12.5px] font-bold tabular-nums leading-tight",
                              yearAuditKind &&
                                "cursor-pointer rounded-sm underline decoration-dotted decoration-1 underline-offset-2 hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
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
                        </div>,
                        getYearTotalForRow(row, data).amount,
                        data.yearTotals?.totalEntrada,
                      )}
                    </DetailAnimatedCell>
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
        )}
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
        externalLink={specialFeesExternalLink}
        onClose={() => setAuditTarget(null)}
      />
    </TooltipProvider>
  );
}
