"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  boardColumnsForKind,
  nextStatusForKind,
  statusLabelsForKind,
} from "@/lib/replenishment-cycle";
import type { OperationsBoardCard } from "@/lib/replenishment-cycle-data";
import { supplierPathSegment } from "@/lib/purchase-analysis";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type OperationsKanbanCardProps = {
  card: OperationsBoardCard;
  onAdvance: () => void | Promise<void>;
  onMove: (status: ReplenishmentStatus) => void | Promise<void>;
  busy: boolean;
};

export function OperationsKanbanCard({
  card,
  onAdvance,
  onMove,
  busy,
}: OperationsKanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const next = nextStatusForKind(card.kind, card.status);
  const labels = statusLabelsForKind(card.kind);
  const columns = boardColumnsForKind(card.kind);
  const urgent =
    card.kind === "purchase"
      ? card.purchaseIsOverdue
      : card.searchIsOverdue;

  const advanceLabel =
    card.kind === "full" && card.status === "scheduled"
      ? "Coletado"
      : "Avançar";

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
        {card.kind === "purchase" &&
        card.suggestedQty != null &&
        card.suggestedQty > 0 ? (
          <>
            <span>·</span>
            <span>Sug. {card.suggestedQty} un.</span>
          </>
        ) : null}
      </div>

      {card.kind === "purchase" && card.purchaseStartsOn ? (
        <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
          Comprar em {card.purchaseStartsOn}
        </p>
      ) : null}
      {card.kind === "full" && card.searchStartsOn ? (
        <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
          Full em {card.searchStartsOn}
        </p>
      ) : null}

      {urgent ? (
        <Badge variant="warning" className="mt-2 h-5 px-1.5 text-[10px]">
          Urgente
        </Badge>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {next ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => void onAdvance()}
          >
            {advanceLabel}
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
              {columns
                .filter((status) => status !== card.status)
                .map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--muted)]"
                    onClick={() => {
                      setMenuOpen(false);
                      void onMove(status);
                    }}
                  >
                    {labels[status]}
                  </button>
                ))}
              <button
                type="button"
                className="block w-full border-t border-[var(--border)] px-3 py-1.5 text-left text-xs hover:bg-[var(--muted)]"
                onClick={() => {
                  setMenuOpen(false);
                  void onMove("completed");
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
        {card.kind === "purchase" ? (
          <Link
            href={`/dashboard/compras/${supplierPathSegment(card.supplier)}`}
            className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
          >
            Análise
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
