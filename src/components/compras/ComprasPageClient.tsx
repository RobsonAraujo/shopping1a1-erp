"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ComprasSupplierGrid } from "@/components/compras/ComprasSupplierGrid";
import { OperationsKanban } from "@/components/operacoes-full/OperationsKanban";
import type {
  PurchaseAnalysisItemRow,
  SupplierSummary,
} from "@/lib/compras/purchase-analysis-rows";
import type { OperationsBoardsData } from "@/lib/compras/replenishment-cycle-data";
import { cn } from "@/lib/utils";

type ComprasTab = "fornecedor" | "kanban";

type ComprasPageClientProps = {
  summaries: SupplierSummary[];
  rows: PurchaseAnalysisItemRow[];
  boards: OperationsBoardsData;
};

export function ComprasPageClient({
  summaries,
  rows,
  boards,
}: ComprasPageClientProps) {
  const searchParams = useSearchParams();
  const initialTab = useMemo((): ComprasTab => {
    const tab = searchParams.get("tab");
    return tab === "kanban" ? "kanban" : "fornecedor";
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<ComprasTab>(initialTab);

  const tabs: Array<{ id: ComprasTab; label: string }> = [
    { id: "fornecedor", label: "Por fornecedor" },
    { id: "kanban", label: "Kanban de reposição" },
  ];

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Visão de compras"
        className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-1"
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "inline-flex cursor-pointer items-center rounded-md px-4 py-2 text-sm font-medium transition-colors",
                selected
                  ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "fornecedor" ? (
        summaries.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhum anúncio encontrado. Quando houver produtos ativos ou pausados
            no Mercado Livre, os fornecedores aparecerão aqui.
          </p>
        ) : (
          <ComprasSupplierGrid summaries={summaries} rows={rows} />
        )
      ) : (
        <OperationsKanban initialData={boards} kind="purchase" />
      )}
    </div>
  );
}
