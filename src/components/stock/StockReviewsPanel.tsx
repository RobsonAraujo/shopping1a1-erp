"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageX, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { Combobox } from "@/components/ui/combobox";
import { readApiError } from "@/lib/api/api-client-error";
import type { StockReviewRow } from "@/lib/stock/stock-page-data";
import { formatUnits } from "@/components/stock/stock-format";

type ItemOption = { stockItemId: string; title: string; sku: string | null };

const KIND_META = {
  return_to_check: { icon: Undo2, title: "Devolução a conferir" },
  unmapped_sale: { icon: PackageX, title: "Venda sem produto" },
} as const;

function QuantityInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <FormInput
      type="number"
      min={1}
      inputMode="numeric"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="space-y-0"
      inputClassName="h-9 w-20 text-right tabular-nums sm:h-9"
    />
  );
}

function ReviewCard({ review, items }: { review: StockReviewRow; items: ItemOption[] }) {
  const router = useRouter();
  const [qty, setQty] = useState(String(review.quantity));
  const [linkTo, setLinkTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = KIND_META[review.kind];
  const Icon = meta.icon;

  async function decide(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/stock/reviews/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readApiError(res, "stock_action_failed"));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const units = Math.max(1, Math.round(Number(qty) || 0));
  const itemLabel = review.itemTitle ?? review.listingTitle ?? review.listingMlItemId ?? "Produto";

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm">
            <span className="font-medium">{meta.title}:</span>{" "}
            <span className="tabular-nums">{formatUnits(review.quantity)} un</span> ·{" "}
            <span className="text-[var(--foreground)]">{itemLabel}</span>
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {review.kind === "return_to_check"
              ? `Pedido ${review.orderId ?? "—"} · ${review.reason === "cancelled_after_dispatch" ? "cancelado depois do envio" : "devolvido ou reembolsado"}. O produto voltou para casa?`
              : `Pedido ${review.orderId ?? "—"} · anúncio ${review.listingMlItemId ?? "—"} não está ligado a nenhum produto do estoque.`}
          </p>
          {error ? <p className="mt-1 text-xs text-[var(--destructive)]">{error}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {review.kind === "return_to_check" ? (
          <>
            <QuantityInput value={qty} onChange={setQty} label="Quantidade que voltou" />
            <Button size="sm" disabled={busy} onClick={() => void decide({ action: "returned_good", quantity: units })}>
              Voltou boa
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide({ action: "returned_damaged" })}>
              Voltou avariada
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide({ action: "not_returned" })}>
              Não voltou
            </Button>
          </>
        ) : (
          <>
            <Combobox
              value={linkTo}
              onValueChange={setLinkTo}
              placeholder="Escolha o produto…"
              searchPlaceholder="Buscar por nome ou SKU…"
              aria-label="Produto do estoque"
              triggerClassName="w-64"
              options={items.map((i) => ({ value: i.stockItemId, label: i.sku ? `${i.sku} · ${i.title}` : i.title }))}
            />
            <Button
              size="sm"
              disabled={busy || !linkTo}
              onClick={() => void decide({ action: "link_listing", stockItemId: linkTo })}
            >
              Ligar e baixar
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide({ action: "dismiss" })}>
              Ignorar
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Pendências abertas — as únicas coisas que pedem uma decisão do usuário. */
export function StockReviewsPanel({ reviews, items }: { reviews: StockReviewRow[]; items: ItemOption[] }) {
  const sorted = useMemo(() => {
    const order = { return_to_check: 0, unmapped_sale: 1 } as const;
    return [...reviews].sort((a, b) => order[a.kind] - order[b.kind] || b.detectedAt.localeCompare(a.detectedAt));
  }, [reviews]);
  if (sorted.length === 0) return null;
  return (
    <Card id="pendencias" className="overflow-hidden rounded-2xl">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">
          Precisa de você <span className="text-[var(--muted-foreground)]">· {sorted.length}</span>
        </h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Só isto pede uma decisão. O resto o ERP já fez.
        </p>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {sorted.map((review) => (
          <ReviewCard key={review.id} review={review} items={items} />
        ))}
      </ul>
    </Card>
  );
}
