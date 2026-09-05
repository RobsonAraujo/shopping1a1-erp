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
import {
  AlertCircle,
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Landmark,
  List,
  Pencil,
  PiggyBank,
  Receipt,
  RefreshCw,
  Rocket,
  TrendingDown,
  TrendingUp,
  Undo2,
  X,
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
} from "@/lib/pricing/financial-margin";
import { DreProductCostAuditModal } from "@/components/dre/DreProductCostAuditModal";
import { DreTaxAuditModal } from "@/components/dre/DreTaxAuditModal";
import { DreLineAuditModal } from "@/components/dre/DreLineAuditModal";
import { DreMonthHeaderCell } from "@/components/dre/DreMonthHeaderCell";
import { DreRevenuePie, WaterfallConnector } from "@/components/dre/DreRevenuePie";
import {
  useDreAuditTarget,
  auditTargetNeedsResync,
  getAuditKindForRow,
  type AuditKind,
} from "@/components/dre/use-dre-audit-target";
import {
  DIM_CLASS,
  formatSyncTime,
  getMonthAlertMessages,
} from "@/components/dre/DreYearTableShared";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import {
  isDreEditableLineKey,
  percentOfRevenue,
  type DreEditableLineKey,
} from "@/lib/dre/dre-calculations";
import {
  buildDreTableRows,
  DEFAULT_DRE_VISIBILITY,
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
import {
  CATEGORY_BADGE_CLASS as GROUP_TONE_CLASS,
  CATEGORY_BORDER_COLOR as GROUP_BORDER_COLOR,
  CATEGORY_ROW_TINT_CLASS as GROUP_ROW_TINT_CLASS,
  type CategoryTone,
} from "@/lib/ui/tone";
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

const SELECTED_MONTH_CELL_CLASS = "relative";

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
        className="rounded bg-amber-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-800"
        title="Valor ajustado manualmente após o último sync"
      >
        ajustado
      </span>
      {onRestore ? (
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center rounded text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
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
  const panelRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedOnceRef = useRef(false);

  const EDITOR_MIN_WIDTH_PX = 320;
  const VIEWPORT_PAD_PX = 16;
  const EDITOR_PANEL_HEIGHT_PX = 220;

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

  // Clique fora do painel cancela a edição — mesmo padrão já usado nos
  // outros popovers do app (combobox de SKU, seletor de período etc.).
  useEffect(() => {
    if (!editing || isMobile) return;
    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        cancelEditing();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, isMobile]);

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
          : "h-14 w-full rounded-xl border-0 bg-[var(--muted)]/50 px-3.5 text-right text-2xl font-bold tabular-nums text-[var(--foreground)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none ring-1 ring-[var(--border)] transition-[box-shadow,ring-color,background-color] duration-150 focus:bg-[var(--background)] focus:shadow-none focus:ring-2 focus:ring-[var(--primary)]/50"
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
                className="inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-amber-800"
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
                ref={panelRef}
                className={cn(
                  "overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-2xl ring-1 ring-black/5 transition-[opacity,transform] duration-200 ease-out",
                  panelEntered
                    ? "translate-y-0 scale-100 opacity-100"
                    : "-translate-y-1 scale-95 opacity-0",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--muted)]/30 px-3.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--primary)]/10 text-[var(--primary)]">
                      <Pencil className="size-3.5" aria-hidden />
                    </span>
                    <p className="truncate text-xs font-semibold text-[var(--foreground)]">
                      {label}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Cancelar edição"
                    className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => cancelEditing()}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
                <div className="p-3.5">
                  {moneyInput}
                  <p className="mt-2 text-center text-[11px] text-[var(--muted-foreground)]">
                    <kbd className="rounded border border-[var(--border)] bg-[var(--muted)] px-1 py-0.5 font-sans text-[10px] font-medium">
                      Enter
                    </kbd>{" "}
                    aplica ·{" "}
                    <kbd className="rounded border border-[var(--border)] bg-[var(--muted)] px-1 py-0.5 font-sans text-[10px] font-medium">
                      Esc
                    </kbd>{" "}
                    cancela
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 gap-1.5 text-sm font-semibold"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => cancelEditing()}
                    >
                      <X className="size-3.5" aria-hidden />
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      className="h-10 gap-1.5 text-sm font-semibold"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commit(draft)}
                    >
                      <Check className="size-3.5" aria-hidden />
                      Aplicar
                    </Button>
                  </div>
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
          adjusted && "text-amber-900",
          !muted && !adjusted && valueToneClass(displayAmount),
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
  const groupVisual = row.type === "static" ? GROUP_VISUALS[row.id] : undefined;
  const GroupIcon = groupVisual?.icon;

  return (
    <div
      className={cn(
        "flex min-w-0",
        GroupIcon ? "items-center gap-1.5" : "items-start",
        indent && "pl-2.5",
      )}
      title={source ? undefined : row.label}
    >
      {GroupIcon ? (
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md",
            GROUP_TONE_CLASS[groupVisual.tone],
          )}
        >
          <GroupIcon className="size-3" aria-hidden />
        </span>
      ) : null}
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
  // Meses futuros são editáveis manualmente (orçamento/planejamento antecipado);
  // só o sync automático via ML continua bloqueado pra mês futuro.
  const canEditMonth = true;
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
  // Computado uma vez por linha (em vez de a cada uso abaixo) — sem isso,
  // getYearTotalForRow (que soma os 12 meses pra linhas de custo) rodava 3x
  // por linha na coluna "Total".
  const yearTotal = isTotal ? getYearTotalForRow(row, data) : null;

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
        {formatFinancialMoney(yearTotal!.amount)}
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
    ? yearTotal!.percent
    : getCellValue(row, month!).percent;
  const revenueAmount = isTotal
    ? yearTotal!.amount
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
  const {
    auditTarget,
    setAuditTarget,
    productCostAuditItems,
    taxAuditItems,
    auditTitle,
    lineAuditState,
    lineAuditText,
    specialFeesExternalLink,
  } = useDreAuditTarget(data);

  function updateSelection(next: DreMobileSelection) {
    setSelection(next);
    if (!onSelectedMonthChange) return;
    if (next === "total") {
      onSelectedMonthChange(null);
      return;
    }
    onSelectedMonthChange(data.months[next]?.month ?? null);
  }

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
  Record<DreStaticRowId, { icon: typeof TrendingUp; tone: CategoryTone }>
> = {
  totalEntrada: { icon: Banknote, tone: "primary" },
  totalCustoOperacional: { icon: Receipt, tone: "rose" },
  totalCustoFixo: { icon: Landmark, tone: "amber" },
  totalInvestimento: { icon: Rocket, tone: "violet" },
  totalSaidaNaoOperacional: { icon: TrendingDown, tone: "rose" },
  totalEntradaNaoOperacional: { icon: PiggyBank, tone: "emerald" },
};


type SectionBoxPosition = "first" | "middle" | "last" | "only";

/** Camadas de box-shadow que desenham os lados da "caixa" da seção que
 * tocam esta célula. `edge` diz se a célula é a borda esquerda/direita da
 * tabela (onde entra a borda lateral) ou uma célula de mês no meio (só topo/
 * base, quando a linha é a primeira/última da seção). */
function sectionBoxShadowLayers(
  position: SectionBoxPosition | undefined,
  edge: "outer-start" | "outer-end" | "inner",
  color: string | undefined,
): string[] {
  if (!position || !color) return [];
  const layers: string[] = [];
  if (edge === "outer-start") layers.push(`inset 2px 0 0 0 ${color}`);
  if (edge === "outer-end") layers.push(`inset -2px 0 0 0 ${color}`);
  if (position === "first" || position === "only") {
    layers.push(`inset 0 2px 0 0 ${color}`);
  }
  if (position === "last" || position === "only") {
    layers.push(`inset 0 -2px 0 0 ${color}`);
  }
  return layers;
}

function withSectionBox(
  baseStyle: CSSProperties | undefined,
  position: SectionBoxPosition | undefined,
  edge: "outer-start" | "outer-end" | "inner",
  color: string | undefined,
): CSSProperties | undefined {
  const layers = sectionBoxShadowLayers(position, edge, color);
  if (layers.length === 0) return baseStyle;
  const existing = (baseStyle as { boxShadow?: string } | undefined)
    ?.boxShadow;
  return {
    ...baseStyle,
    boxShadow: existing
      ? `${layers.join(", ")}, ${existing}`
      : layers.join(", "),
  };
}

const SECTION_CORNER_CLASS: Record<
  "start" | "end",
  Record<SectionBoxPosition, string>
> = {
  start: {
    first: "rounded-tl-xl",
    only: "rounded-tl-xl rounded-bl-xl",
    last: "rounded-bl-xl",
    middle: "",
  },
  end: {
    first: "rounded-tr-xl",
    only: "rounded-tr-xl rounded-br-xl",
    last: "rounded-br-xl",
    middle: "",
  },
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

  const resultLiquido = totals?.resultadoLiquido ?? null;
  const resultLiquidoPercent = totals?.resultadoLiquidoPercent ?? null;

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

        <div className="mx-auto flex max-w-xl flex-col items-stretch">
          {groups.map((group, index) => (
            <div key={group.header.id} className="flex flex-col items-stretch">
              {index > 0 ? (
                <WaterfallConnector operator={connectorOperatorForGroup(group)} />
              ) : null}
              {renderStatementGroup(group)}
            </div>
          ))}
          {resultLiquido !== null ? (
            <>
              <WaterfallConnector operator="=" />
              {renderResultCard(resultLiquido, resultLiquidoPercent)}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  function connectorOperatorForGroup(group: StatementGroup): "+" | "-" {
    // Sinal estrutural da categoria no DRE (fixo), não o sinal do valor do
    // período — senão um mês com Investimentos = R$ 0 mostraria "+" mesmo
    // sendo uma linha de custo (o título do card já diz "(-) Investimentos").
    return group.header.type === "static" &&
      group.header.id === "totalEntradaNaoOperacional"
      ? "+"
      : "-";
  }

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

  function renderResultCard(amount: number, percent: number | null) {
    const isLoss = amount < 0;
    return (
      <div
        className={cn(
          "overflow-hidden rounded-2xl border-2",
          isLoss
            ? "border-rose-300"
            : "border-emerald-300",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-4 py-3.5",
            isLoss
              ? "bg-rose-50"
              : "bg-emerald-50",
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                isLoss
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-100 text-emerald-700",
              )}
            >
              <TrendingUp className="size-4" aria-hidden />
            </span>
            <p className="truncate text-sm font-semibold text-[var(--foreground)]">
              Resultado líquido
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <p
              className={cn(
                "text-base font-bold tabular-nums",
                valueToneClass(amount),
              )}
            >
              {formatFinancialMoney(amount)}
            </p>
            {percent !== null ? (
              <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
                {percent.toFixed(2).replace(".", ",")}% da receita
              </p>
            ) : null}
          </div>
        </div>
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

/** Respiro entre seções — deixa cada categoria "flutuar" como uma caixa
 * separada, igual ao espaçamento entre cards no Demonstrativo. */
function SectionSpacerRow({ columnCount }: { columnCount: number }) {
  return (
    <tr aria-hidden="true">
      <td colSpan={columnCount} className="h-5 border-0 bg-[var(--card)] p-0" />
    </tr>
  );
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
  const {
    auditTarget,
    setAuditTarget,
    productCostAuditItems,
    taxAuditItems,
    auditTitle,
    lineAuditState,
    lineAuditText,
    specialFeesExternalLink,
  } = useDreAuditTarget(data);
  const isEditing = editingCell !== null;
  const columnFocusMonth = isEditing ? null : selectedMonth;

  function isEditingThisCell(month: number, rowId: string) {
    return (
      editingCell !== null &&
      editingCell.month === month &&
      editingCell.rowId === rowId
    );
  }

  // Antes recomputado (junto com detailIndexById/rowSection abaixo) em TODO
  // render deste componente — inclusive quando só uma célula entra/sai de
  // edição, que não muda o shape das linhas. Memoizado com as mesmas deps do
  // ramo mobile (buildDreTableRows/filterRowsByVisibility não dependem de
  // month/showDetails, só do catálogo de custos + visibilidade).
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

  // Mesmo agrupamento por categoria do Demonstrativo — usado pra abrir um
  // respiro visual (spacer row) entre seções e deixar as linhas de
  // resultado (Margem de Contribuição, Lucro Operacional...) soltas, fora
  // das "caixas" de cada categoria.
  const rowSection = useMemo(() => {
    const map = new Map<
      string,
      { position: SectionBoxPosition; tone: CategoryTone }
    >();
    for (const group of buildStatementGroups(rows)) {
      if (group.header.type !== "static") continue;
      const visual = GROUP_VISUALS[group.header.id];
      if (!visual) continue;
      const groupRows = [group.header, ...group.items];
      groupRows.forEach((r, i) => {
        map.set(r.id, {
          tone: visual.tone,
          position:
            groupRows.length === 1
              ? "only"
              : i === 0
                ? "first"
                : i === groupRows.length - 1
                  ? "last"
                  : "middle",
        });
      });
    }
    return map;
  }, [rows]);

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
                <DreMonthHeaderCell
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
              // Linhas de total de categoria ganham o mesmo tom de cor do
              // card equivalente no Demonstrativo, em vez do cinza genérico.
              const groupVisual =
                row.type === "static" ? GROUP_VISUALS[row.id] : undefined;
              const bg = groupVisual
                ? GROUP_ROW_TINT_CLASS[groupVisual.tone]
                : rowBackgroundClass(row);
              const showPercentRow = row.type === "static" && row.showPercent;
              const detail = isDetailRow(row);
              const detailIndex = detailIndexById.get(row.id) ?? 0;
              // Linhas com percentual logo abaixo não desenham borda inferior —
              // a separação já é feita pela borda da própria linha de percentual.
              const dividerStyle = showPercentRow
                ? undefined
                : MAIN_ROW_DIVIDER_STYLE;
              const rowClassName = bg;
              const cellStyle = dividerStyle;
              const yearAuditKind = getAuditKindForRow(row);
              // Computado uma vez por linha (era chamado separadamente 4x
              // logo abaixo) — pra linhas de custo, getYearTotalForRow soma
              // os 12 meses por chamada, então isso evitava somar o ano 4x
              // por linha em todo render da tabela.
              const yearTotal = getYearTotalForRow(row, data);
              const section = rowSection.get(row.id);
              const sectionPosition = section?.position;
              const sectionColor = section
                ? GROUP_BORDER_COLOR[section.tone]
                : undefined;
              // A linha de percentual (quando existe) vem logo abaixo da
              // principal — a borda de topo da seção já foi desenhada ali,
              // então aqui só repete os lados (e a base, se for a última).
              const percentRowPosition: SectionBoxPosition | undefined =
                sectionPosition === "first" ? "middle" : sectionPosition;
              const isResultRow =
                row.type === "static" && row.kind === "resultado";
              const needsSpacerBefore =
                index > 0 &&
                (sectionPosition === "first" ||
                  sectionPosition === "only" ||
                  isResultRow);

              return (
                <Fragment key={row.id}>
                  {needsSpacerBefore ? (
                    <SectionSpacerRow columnCount={data.months.length + 2} />
                  ) : null}
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
                        SECTION_CORNER_CLASS.start[sectionPosition ?? "middle"],
                        (isEditing || columnFocusMonth !== null) && DIM_CLASS,
                      )}
                      contentClassName="px-3 py-2"
                      style={withSectionBox(
                        cellStyle,
                        sectionPosition,
                        "outer-start",
                        sectionColor,
                      )}
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
                          style={withSectionBox(
                            cellStyle,
                            sectionPosition,
                            "inner",
                            sectionColor,
                          )}
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
                        SECTION_CORNER_CLASS.end[sectionPosition ?? "middle"],
                        (isEditing || columnFocusMonth !== null) && DIM_CLASS,
                      )}
                      contentClassName="px-2 py-2 text-center align-middle"
                      style={withSectionBox(
                        cellStyle,
                        sectionPosition,
                        "outer-end",
                        sectionColor,
                      )}
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
                              valueToneClass(yearTotal.amount),
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
                            {formatFinancialMoney(yearTotal.amount)}
                          </div>
                        </div>,
                        yearTotal.amount,
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
                          SECTION_CORNER_CLASS.start[
                            percentRowPosition ?? "middle"
                          ],
                          (isEditing || columnFocusMonth !== null) &&
                            DIM_CLASS,
                        )}
                        style={withSectionBox(
                          PERCENT_ROW_DIVIDER_STYLE,
                          percentRowPosition,
                          "outer-start",
                          sectionColor,
                        )}
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
                          style={withSectionBox(
                            PERCENT_ROW_DIVIDER_STYLE,
                            percentRowPosition,
                            "inner",
                            sectionColor,
                          )}
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
                          SECTION_CORNER_CLASS.end[
                            percentRowPosition ?? "middle"
                          ],
                          (isEditing || columnFocusMonth !== null) &&
                            DIM_CLASS,
                        )}
                        style={withSectionBox(
                          PERCENT_ROW_DIVIDER_STYLE,
                          percentRowPosition,
                          "outer-end",
                          sectionColor,
                        )}
                      >
                        {renderPercentCell(yearTotal.percent)}
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
