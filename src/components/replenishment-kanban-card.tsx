"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BOARD_COLUMN_STATUSES,
  nextReplenishmentStatus,
  REPLENISHMENT_STATUS_LABELS,
} from "@/lib/replenishment-cycle";
import type { ReplenishmentBoardCard } from "@/lib/replenishment-cycle-data";
import { supplierPathSegment } from "@/lib/purchase-analysis";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type ReplenishmentKanbanCardProps = {
  card: ReplenishmentBoardCard;
  onAdvance: (cycleId: string, options?: { skipFull?: boolean }) => Promise<void>;
  onMove: (cycleId: string, status: ReplenishmentStatus) => Promise<void>;
  busy: boolean;
};

export function ReplenishmentKanbanCard({
  card,
  onAdvance,
  onMove,
  busy,
}: ReplenishmentKanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const next = nextReplenishmentStatus(card.status, {
    skipFull: !card.needsSchedulingAttention,
  });
  const urgent = card.purchaseIsOverdue || card.searchIsOverdue;

  return (
    <article
      className={cn(
        "rounded-lg border bg-[var(--card)] p-3 shadow-sm",
        urgent ? "border-rose-200" : "border-[var(--border)]",
      )}
    >
      <div className="flex items-start gap-2.5">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt=""
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
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {card.mlItemId}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
            {card.supplier}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[var(--muted-foreground)]">
        <span>ML {card.mlStock}</span>
        <span>·</span>
        <span>Galpão {card.warehouseStock}</span>
        {card.suggestedQty != null && card.suggestedQty > 0 ? (
          <>
            <span>·</span>
            <span>Sug. {card.suggestedQty} un.</span>
          </>
        ) : null}
      </div>

      {card.purchaseStartsOn ? (
        <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
          Comprar em {card.purchaseStartsOn}
        </p>
      ) : null}
      {card.status === "full_pending" && card.searchStartsOn ? (
        <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
          Full em {card.searchStartsOn}
        </p>
      ) : null}

      {urgent ? (
        <Badge variant="warning" className="mt-2 h-5 px-1.5 text-[10px]">
          Urgente
        </Badge>
      ) : null}
      {card.status === "in_warehouse" && card.needsSchedulingAttention ? (
        <Badge variant="secondary" className="mt-2 h-5 px-1.5 text-[10px]">
          Full pendente
        </Badge>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {next ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() =>
              void onAdvance(card.cycleId, {
                skipFull:
                  card.status === "in_warehouse" &&
                  !card.needsSchedulingAttention,
              })
            }
          >
            Avançar
          </Button>
        ) : null}
        <div className="relative">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
          >
            Mover para…
          </Button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-md border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
              {BOARD_COLUMN_STATUSES.filter((status) => status !== card.status).map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--muted)]"
                    onClick={() => {
                      setMenuOpen(false);
                      void onMove(card.cycleId, status);
                    }}
                  >
                    {REPLENISHMENT_STATUS_LABELS[status]}
                  </button>
                ),
              )}
              <button
                type="button"
                className="block w-full border-t border-[var(--border)] px-3 py-1.5 text-left text-xs hover:bg-[var(--muted)]"
                onClick={() => {
                  setMenuOpen(false);
                  void onMove(card.cycleId, "completed");
                }}
              >
                Concluído
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        <Link
          href={`/dashboard/items/${card.mlItemId}`}
          className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
        >
          Anúncio
          <ExternalLink className="size-3" aria-hidden />
        </Link>
        <Link
          href={`/dashboard/compras/${supplierPathSegment(card.supplier)}`}
          className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
        >
          Análise
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
