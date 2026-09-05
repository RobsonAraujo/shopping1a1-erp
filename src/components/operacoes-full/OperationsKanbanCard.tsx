"use client";

import Image from "next/image";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { ExternalLink, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricWithHint } from "@/components/shared/MetricWithHint";
import { supplierPathSegment } from "@/lib/compras/purchase-analysis";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";
import { cn } from "@/lib/utils";

export const OPERATIONS_DRAG_ID_PREFIX = "cycle:";

function OperationsCardHeader({ card }: { card: OperationsBoardCard }) {
  const urgent = card.kind === "purchase" ? card.purchaseIsOverdue : card.searchIsOverdue;

  return (
    <div className="p-3">
      <div className="flex items-start gap-2.5">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.title}
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
            <ImageOff className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={card.sku ?? card.title}>
            {card.sku ?? card.title}
          </p>
          <p className="truncate text-xs text-[var(--muted-foreground)]">{card.mlItemId}</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{card.supplier}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[var(--muted-foreground)]">
        <span>ML {card.mlStock}</span>
        <span>·</span>
        <span>Galpão {card.warehouseStock}</span>
        {card.kind === "purchase" && card.suggestedQty != null && card.suggestedQty > 0 ? (
          <>
            <span>·</span>
            <span>Sug. {card.suggestedQty} un.</span>
          </>
        ) : null}
      </div>

      {card.kind === "purchase" && card.purchaseStartsOn ? (
        <MetricWithHint
          content={card.purchaseStartsOnTooltip}
          className="mt-1.5 text-[11px] text-[var(--muted-foreground)]"
        >
          Comprar em {card.purchaseStartsOn}
        </MetricWithHint>
      ) : null}
      {card.kind === "full" && card.searchStartsOn ? (
        // Data pra COMEÇAR a agendar/buscar o envio ao Full (esgotamento
        // previsto do estoque ML menos o lead time) — não é "quando fica
        // Full". Nome bate com a coluna "Agendado" do board; o tooltip
        // (ícone de ajuda) explica a conta pro usuário.
        <MetricWithHint
          content={card.searchStartsOnTooltip}
          className="mt-1.5 text-[11px] text-[var(--muted-foreground)]"
        >
          Agendar em {card.searchStartsOn}
        </MetricWithHint>
      ) : null}

      {urgent ? (
        <Badge variant="warning" className="mt-2 h-5 px-1.5 text-[10px]">
          Urgente
        </Badge>
      ) : null}
    </div>
  );
}

/** Único link de ação do card. Avançar/mover etapa agora é só via
 * drag-and-drop (arrastar o card entre colunas) — os botões "Avançar"/
 * "Mover para…" saíram pra não duplicar visualmente o que o drag já faz. */
function OperationsCardFooter({ card }: { card: OperationsBoardCard }) {
  return (
    <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2">
      <Button asChild size="sm" variant="secondary" className="h-7 w-full gap-1.5 text-xs font-semibold">
        <Link href={`/dashboard/items/${card.mlItemId}`}>
          Ver anúncio
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </Button>
      {card.kind === "purchase" ? (
        <Button asChild size="sm" variant="outline" className="h-7 w-full gap-1.5 text-xs font-semibold">
          <Link href={`/dashboard/compras/${supplierPathSegment(card.supplier)}`}>
            Análise
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/** Aparência completa do card (cabeçalho + rodapé) — usada tanto pelo card
 * "de verdade" (arrastável) quanto pela cópia flutuante do `DragOverlay`.
 * Ter uma só definição visual evita que o card "se desmonte" durante o
 * arrasto (a cópia flutuante do overlay é sempre o card inteiro). */
export function OperationsCardBody({
  card,
  className,
}: {
  card: OperationsBoardCard;
  className?: string;
}) {
  const urgent = card.kind === "purchase" ? card.purchaseIsOverdue : card.searchIsOverdue;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-[var(--card)] shadow-sm",
        urgent ? "border-rose-200" : "border-[var(--border)]",
        className,
      )}
    >
      <OperationsCardHeader card={card} />
      <OperationsCardFooter card={card} />
    </article>
  );
}

export function OperationsKanbanCard({
  card,
  busy,
}: {
  card: OperationsBoardCard;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${OPERATIONS_DRAG_ID_PREFIX}${card.cycleId}`,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-0",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <OperationsCardBody card={card} />
    </div>
  );
}
