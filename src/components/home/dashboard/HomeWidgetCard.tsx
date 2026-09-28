"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ImageOff,
} from "lucide-react";
import {
  createContext,
  useContext,
  useId,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { CATEGORY_BADGE_CLASS } from "@/lib/ui/tone";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import { HomeWidgetMoveMenu } from "@/components/home/dashboard/HomeWidgetMoveMenu";
import { cn } from "@/lib/utils";

/**
 * A **única** casca de card da Home. Antes existiam quatro (KPI com o card
 * inteiro virando link, colapsável com header de toggle, seção com o título
 * fora da superfície, e esta) — o que tornava impossível a regra "todo card se
 * arrasta pelo header".
 *
 * Duas decisões não óbvias:
 *
 * **Recebe `definitionId`, não a definição.** `DashboardSalesCard` é renderizado
 * no **servidor** (vai pra grade como o nó `sellerCard`), e a definição carrega
 * `icon`, que é função — passar daria "Functions cannot be passed directly to
 * Client Components".
 *
 * **Ponteiro e teclado arrastam por caminhos diferentes.** O header todo
 * responde ao ponteiro (mãozinha, arrasta de qualquer ponto), mas os
 * `attributes` do dnd-kit e o `onKeyDown` ficam numa alça própria. Se ficassem
 * no mesmo botão que colapsa, Espaço/Enter dispararia as duas coisas.
 *
 * Clicar sem arrastar continua funcionando: o `MouseSensor` só ativa após 5px e
 * o `TouchSensor` após 250ms mantidos, e quando o arrasto ativa o dnd-kit
 * engole o `click` seguinte.
 *
 * **Invariante que o layout em colunas impõe:** reordenar dentro da coluna
 * preserva a instância do widget; mover **entre** colunas remonta (dois
 * containers React = dois pais). Então nenhum widget pode guardar estado
 * não-persistido nem disparar request não-cacheado no mount.
 */

/** Atributos de dados dos dois elementos do arrasto. Ficam no DOM para os testes
 * (e para inspeção) poderem apontar neles; quem registra usa os refs abaixo. */
export const HOME_DRAG_ELEMENT_ATTR = "data-home-drag-element";
export const HOME_DRAG_HANDLE_ATTR = "data-home-drag-handle";

export type HomeWidgetDragProps = {
  /**
   * `ref` do header (o elemento que o pdnd arrasta) e da zona de agarrar.
   *
   * São **refs de callback**, não `querySelector` no effect do slot: quatro
   * widgets da Home entram por `next/dynamic` e renderizam um skeleton no
   * primeiro paint, então procurar o elemento no mount não achava nada e o card
   * nunca era registrado — mostrava mãozinha e, ao arrastar, selecionava o texto.
   * Com o elemento em estado, o effect roda de novo quando ele aparece.
   */
  setDragElementRef?: (element: HTMLElement | null) => void;
  setDragHandleRef?: (element: HTMLElement | null) => void;
  /** Booleano explícito, e não `Boolean(setDragElementRef)`: o React Compiler
   * trata a função de ref como ref e proíbe **ler** ela durante o render
   * ("Cannot access refs during render"). Passar para `ref=` é permitido. */
  draggable?: boolean;
  isDragging?: boolean;
  /** Há algum arrasto em curso na grade. */
  dragging?: boolean;
};

const EMPTY_DRAG: HomeWidgetDragProps = {};

/**
 * Os handles chegam por **contexto**, não por prop: os 15 widgets não precisam
 * repassar nada, e as props de `HomeWidgetRenderer` continuam sendo só
 * `{ id }` — estáveis, então o `memo` dele segue cortando o corpo do widget.
 * Um arrasto re-renderiza os slots e as cascas, e **nenhum corpo de widget**.
 * Widget de faixa não tem provider e cai no vazio: header sem alça.
 */
const HomeWidgetDragContext = createContext<HomeWidgetDragProps>(EMPTY_DRAG);

export function HomeWidgetDragProvider({
  value,
  children,
}: {
  value: HomeWidgetDragProps;
  children: ReactNode;
}) {
  return (
    <HomeWidgetDragContext.Provider value={value}>
      {children}
    </HomeWidgetDragContext.Provider>
  );
}

export function useHomeWidgetDrag(): HomeWidgetDragProps {
  return useContext(HomeWidgetDragContext);
}

export function HomeWidgetCard({
  definitionId,
  children,
  pending = false,
  error = null,
  count,
  status,
  headerIcon,
  actions,
  collapsible = false,
  open = true,
  onToggle,
  className,
  bodyClassName,
}: {
  /** Id do registry. Ver o comentário do módulo: não pode ser a definição. */
  definitionId: string;
  children?: ReactNode;
  pending?: boolean;
  error?: string | null;
  /** Contador ao lado do título (nº de itens pedindo atenção). */
  count?: number;
  /** Segunda linha do header — o "status" dos cards pessoais. */
  status?: string;
  /** Substitui o badge padrão (ex.: o loader animado das tarefas). */
  headerIcon?: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  className?: string;
  bodyClassName?: string;
}) {
  const definition = getHomeWidgetDefinition(definitionId);
  // Desestruturado aqui de propósito: passar o objeto e acessar `drag.campo` no
  // JSX faz o React Compiler reclamar de "Cannot access refs during render" — o
  // mesmo aviso que `use-drop-highlight.ts` documenta.
  const {
    setDragElementRef,
    setDragHandleRef,
    draggable: isDraggable,
    isDragging,
    dragging: dragInProgress,
  } = useHomeWidgetDrag();
  const panelId = useId();

  if (!definition) return null;

  const Icon = definition.icon;
  const draggable = isDraggable === true;
  // Colapsar durante um arrasto animaria a altura no meio da medição do dnd-kit.
  const toggle = dragInProgress ? undefined : onToggle;

  // Impede que um clique num controle do header borbulhe pro toggle.
  const stop = (event: SyntheticEvent) => event.stopPropagation();

  const body = pending ? (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-4 w-44" />
    </div>
  ) : error ? (
    <UserFeedback tone="warning">{error}</UserFeedback>
  ) : (
    children
  );

  return (
    <section
      aria-label={definition.title}
      aria-busy={pending || undefined}
      className={cn(
        "group/card flex flex-col rounded-3xl bg-[var(--card)] p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] sm:p-5",
        isDragging && "opacity-40",
        className,
      )}
    >
      <div
        ref={setDragElementRef}
        {...(draggable ? { [HOME_DRAG_ELEMENT_ATTR]: true } : {})}
        className="flex items-center gap-2"
      >
        {/* A zona de agarrar é só ícone + título: link, ações e menu de mover
            ficam FORA dela, senão clicar neles iniciaria um arrasto. */}
        <div
          ref={setDragHandleRef}
          {...(draggable ? { [HOME_DRAG_HANDLE_ATTR]: true } : {})}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            draggable && !dragInProgress && "cursor-grab",
            draggable && dragInProgress && "cursor-grabbing",
          )}
        >
        {headerIcon ?? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              CATEGORY_BADGE_CLASS[definition.tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        )}

        {collapsible ? (
          // Padrão de acordeão da ARIA APG: o `<h2>` envolve o `<button>`, não o
          // contrário. Conteúdo de botão é apresentacional em ARIA — a
          // tecnologia assistiva achata os descendentes no nome acessível, então
          // um `role="heading"` DENTRO do botão simplesmente não existe, e o
          // contorno de headings da página perdia esta entrada.
          <h2 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={panelId}
              className="w-full rounded-xl text-left focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:outline-none"
            >
              <span className="block truncate text-base font-medium text-[var(--foreground)]">
                {definition.title}
              </span>
              {status ? (
                <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
                  {status}
                </span>
              ) : null}
            </button>
          </h2>
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium text-[var(--foreground)]">
              {definition.title}
            </h2>
            {status ? (
              <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                {status}
              </p>
            ) : null}
          </div>
        )}

        </div>

        {count !== undefined && count > 0 ? (
          <span className="shrink-0 text-sm tabular-nums text-[var(--muted-foreground)]">
            {count.toLocaleString("pt-BR")}
          </span>
        ) : null}

        {actions ? (
          <span className="shrink-0" onPointerDown={stop} onClick={stop}>
            {actions}
          </span>
        ) : null}

        {definition.href ? (
          <Link
            href={definition.href}
            draggable={false}
            onPointerDown={stop}
            className="group/link shrink-0 rounded-full p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label={`Abrir ${definition.title}`}
          >
            <ArrowUpRight
              className="size-4 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
              aria-hidden
            />
          </Link>
        ) : null}

        {collapsible ? (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-300 motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
        ) : null}

        {draggable ? (
          // O pdnd não arrasta por teclado (decisão de projeto deles), então a
          // alça deixou de ser ativador e passou a abrir o menu de mover — a
          // alternativa que a diretriz de acessibilidade deles pede.
          <HomeWidgetMoveMenu widgetId={definitionId} />
        ) : null}
      </div>

      {/* Colapsável mantém o corpo MONTADO e anima a altura, como o antigo
          `CollapsibleHomeCard` fazia. Desmontar ao recolher matava a animação e
          zerava o estado de dentro (o cronômetro do Foco em contagem, o campo do
          checklist). */}
      {collapsible ? (
        <div
          id={panelId}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className={cn("mt-4", bodyClassName)}>{body}</div>
          </div>
        </div>
      ) : (
        <div className={cn("mt-4 flex-1", bodyClassName)}>{body}</div>
      )}
    </section>
  );
}

/**
 * Estado vazio de widget. Nunca "Sem dados": explica a situação e, quando faz
 * sentido, oferece a ação que resolve.
 *
 * Card de alerta vazio **não desaparece** — mostra o "tudo ok". Esconder fazia
 * o usuário achar que o monitoramento não existia. O `role="status"` preserva o
 * anúncio pra leitor de tela que a antiga `DashboardSectionClear` tinha.
 */
export function HomeWidgetEmpty({
  title,
  description,
  actionLabel,
  actionHref,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  tone?: "neutral" | "ok";
}) {
  return (
    <div
      role={tone === "ok" ? "status" : undefined}
      className="flex flex-col items-start justify-center gap-1.5 py-1"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
        {tone === "ok" ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
        ) : null}
        {title}
      </p>
      {description ? (
        <p className="text-sm leading-snug text-[var(--muted-foreground)]">
          {description}
        </p>
      ) : null}
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-1 text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

/** Valor grande + legenda — o miolo dos widgets de KPI. */
export function HomeWidgetMetric({
  value,
  label,
  hint,
  valueClassName,
}: {
  value: string;
  label: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-3xl font-bold tabular-nums tracking-tight text-[var(--foreground)]",
          valueClassName,
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{label}</p>
      {hint ? (
        <p className="mt-1.5 text-xs leading-snug text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Medidor de progresso — extraído do antigo `DashboardKpiCard` preservando a
 * acessibilidade (`role="progressbar"` com `aria-valuenow`).
 */
export function HomeWidgetMeter({
  label,
  value,
  percent,
  fillClassName,
  valueClassName,
  hint,
  pending = false,
}: {
  label: string;
  value?: string;
  percent?: number | null;
  fillClassName: string;
  valueClassName?: string;
  hint?: string;
  pending?: boolean;
}) {
  if (!pending && percent == null) return null;

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-[var(--muted-foreground)]">
          {label}
        </p>
        {pending ? (
          <span className="h-4 w-10 animate-pulse rounded bg-[var(--muted)]" aria-hidden />
        ) : value ? (
          <p className={cn("text-sm font-semibold tabular-nums", valueClassName)}>
            {value}
          </p>
        ) : null}
      </div>
      {pending ? (
        <div className="h-2 w-full animate-pulse rounded bg-[var(--muted)]" aria-hidden />
      ) : (
        <div
          className="relative h-2 w-full rounded bg-[var(--muted)]"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? 0}
        >
          <span
            className={cn("absolute inset-y-0 left-0 rounded", fillClassName)}
            style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
          />
        </div>
      )}
      {hint ? (
        <p className="mt-1.5 text-xs leading-snug text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Teto de linhas dos cards de lista — agora vivem em meia largura. */
export const HOME_WIDGET_LIST_CAP = 5;

/**
 * Linha de lista compacta, compartilhada pelos três cards de alerta (catálogo
 * perdendo, abaixo do PMA, promoções terminando). Os três tinham a mesma
 * estrutura duplicada — miniatura, duas linhas e um número à direita — e a
 * miniatura caiu de 48 para 36px porque agora o card é de uma coluna.
 */
export function HomeWidgetListRow({
  href,
  imageUrl,
  title,
  subtitle,
  trailing,
  trailingClassName,
  hint,
}: {
  href: string;
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  trailing?: string;
  trailingClassName?: string;
  /** `title` do link — o texto longo que não cabe na linha. */
  hint?: string;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={hint}
        className="-mx-2 flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--muted)]/40"
      >
        <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt=""
              width={36}
              height={36}
              className="size-full object-contain"
              sizes="36px"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <ImageOff
                className="size-3.5 text-[var(--muted-foreground)]/70"
                aria-hidden
              />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--foreground)]">
            {title}
          </span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
              {subtitle}
            </span>
          ) : null}
        </span>
        {trailing ? (
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              trailingClassName ?? "text-[var(--foreground)]",
            )}
          >
            {trailing}
          </span>
        ) : null}
      </a>
    </li>
  );
}

/** Casca da lista + o "+ N" quando passa do teto de linhas. */
export function HomeWidgetList({
  children,
  hiddenCount = 0,
  moreHref,
  moreLabel = "Ver todos",
}: {
  children: ReactNode;
  hiddenCount?: number;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <>
      <ul className="flex flex-col divide-y divide-[var(--border)]">{children}</ul>
      {hiddenCount > 0 ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          {moreHref ? (
            <Link
              href={moreHref}
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              {moreLabel} ({(hiddenCount + HOME_WIDGET_LIST_CAP).toLocaleString("pt-BR")})
            </Link>
          ) : (
            `+ ${hiddenCount.toLocaleString("pt-BR")} item(ns)`
          )}
        </p>
      ) : null}
    </>
  );
}
