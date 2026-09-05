"use client";

import Image from "next/image";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { ImageOff, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PURCHASE_STATUS_LABELS } from "@/lib/compras/replenishment-cycle";
import type { SupplierBoardCard } from "@/lib/compras/supplier-board";
import { supplierPathSegment } from "@/lib/compras/purchase-analysis";
import { cn } from "@/lib/utils";

export const SUPPLIER_DRAG_ID_PREFIX = "supplier:";

function SupplierCardHeader({ card }: { card: SupplierBoardCard }) {
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={card.supplier}>
          {card.supplier}
        </p>
        <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs tabular-nums">
          {card.totalActive} a repor
        </span>
      </div>

      {card.breakdown.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.breakdown.map((entry) => (
            <Badge key={entry.status} variant="secondary" className="h-5 px-1.5 text-[10px]">
              {entry.count} {PURCHASE_STATUS_LABELS[entry.status]}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Só os produtos deste fornecedor que precisam de compra (têm um
          ciclo de reposição ativo) — produtos "de boa" não geram ciclo,
          então não aparecem aqui nem em nenhuma coluna do board. */}
      <ul className="mt-2.5 space-y-1.5">
        {card.topItems.map((item) => (
          <li key={item.mlItemId} className="flex items-center gap-2">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt=""
                width={28}
                height={28}
                className="size-7 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
                <ImageOff className="size-3.5" aria-hidden />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--foreground)]">
              {item.sku ?? item.mlItemId}
            </span>
            {item.suggestedQty ? (
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                Comprar {item.suggestedQty} un.
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {card.overflowCount > 0 ? (
        <p className="mt-1 pl-9 text-[11px] text-[var(--muted-foreground)]">
          +{card.overflowCount} mais
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {card.suggestedQtyTotal > 0 ? (
          <span className="text-[11px] text-[var(--muted-foreground)]">
            Comprar {card.suggestedQtyTotal} un. no total
          </span>
        ) : null}
        {card.hasOverdue ? (
          <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
            Urgente
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

/** Único link de ação do card. Avançar/regredir etapa agora é só via
 * drag-and-drop (arrastar o card entre colunas) — os botões "Avançar"/
 * "Mover para…" saíram pra não duplicar visualmente o que o drag já faz. */
function SupplierCardFooter({ card }: { card: SupplierBoardCard }) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2">
      <Button asChild size="sm" variant="secondary" className="h-7 w-full gap-1.5 text-xs font-semibold">
        <Link href={`/dashboard/compras/${supplierPathSegment(card.supplier)}`}>
          <SearchCheck className="size-3.5" aria-hidden />
          Analisar
        </Link>
      </Button>
    </div>
  );
}

/** Aparência completa do card (cabeçalho + rodapé) — usada tanto pelo card
 * "de verdade" (arrastável) quanto pela cópia flutuante do `DragOverlay`.
 * Ter uma só definição visual evita que o card "se desmonte" durante o
 * arrasto (a cópia flutuante do overlay é sempre o card inteiro). */
export function SupplierCardBody({
  card,
  className,
}: {
  card: SupplierBoardCard;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-[var(--card)] shadow-sm",
        card.hasOverdue ? "border-rose-200" : "border-[var(--border)]",
        className,
      )}
    >
      <SupplierCardHeader card={card} />
      <SupplierCardFooter card={card} />
    </article>
  );
}

export function SupplierPurchaseKanbanCard({
  card,
  busy,
}: {
  card: SupplierBoardCard;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${SUPPLIER_DRAG_ID_PREFIX}${card.supplier}`,
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
      <SupplierCardBody card={card} />
    </div>
  );
}
