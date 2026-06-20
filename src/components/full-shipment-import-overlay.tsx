"use client";

import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export type FullShipmentImportProgress = {
  message: string;
};

export function FullShipmentImportOverlay({
  progress,
}: {
  progress: FullShipmentImportProgress;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <Card className="w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Importando coletas Full
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {progress.message}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
              Consultando o faturamento do Mercado Livre. Isso pode levar alguns
              segundos.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
