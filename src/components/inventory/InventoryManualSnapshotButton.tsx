"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type ManualSnapshotResponse =
  | { ok: true; year: number; month: number; itemsSnapshotted: number }
  | { ok: false; error: string };

export function InventoryManualSnapshotButton({
  variant = "outline",
  size = "default",
}: {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/month-snapshot/manual", {
        method: "POST",
      });
      const data = (await res.json()) as ManualSnapshotResponse;
      if (!res.ok || !data.ok) {
        throw new Error(
          !data.ok && data.error
            ? data.error
            : `Não foi possível gerar o snapshot agora (erro ${res.status}).`,
        );
      }
      router.push(
        `/dashboard/inventory/historico?year=${data.year}&month=${data.month}`,
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível gerar o snapshot agora.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-4" aria-hidden />
        )}
        Gerar snapshot de hoje
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
