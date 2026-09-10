"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { readApiError } from "@/lib/api/api-client-error";

type Suggestion = { mlItemId: string; sku: string | null };

type ImportAllProductsModalProps = {
  open: boolean;
  onClose: () => void;
  /** Chamado depois de um import bem-sucedido — o caller recarrega a lista de produtos. */
  onImported: () => void;
};

type ImportResult = {
  createdCount: number;
  skippedExistingCount: number;
  notFoundCount: number;
};

export function ImportAllProductsModal({
  open,
  onClose,
  onImported,
}: ImportAllProductsModalProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/products/suggestions");
      if (!res.ok) {
        setError(await readApiError(res, "products_suggestions_failed"));
        return;
      }
      const json = (await res.json()) as { suggestions: Suggestion[] };
      setSuggestions(json.suggestions);
    } catch {
      setError("Falha de rede ao buscar anúncios sem cadastro.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadSuggestions();
  }, [open, loadSuggestions]);

  async function importAll() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/products/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mlItemIds: suggestions.map((s) => s.mlItemId) }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "products_bulk_import_failed"));
        return;
      }
      const json = (await res.json()) as ImportResult;
      setResult(json);
      setSuggestions([]);
      if (json.createdCount > 0) {
        toast.success(
          `${json.createdCount} produto${json.createdCount === 1 ? "" : "s"} importado${json.createdCount === 1 ? "" : "s"} como pendente${json.createdCount === 1 ? "" : "s"} de custo.`,
        );
        onImported();
      }
    } catch {
      setError("Falha de rede ao importar os anúncios.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Importar todos os anúncios</SheetTitle>
          <p className="text-xs text-[var(--muted-foreground)]">
            Cadastra de uma vez todo anúncio do Mercado Livre ainda sem
            produto em Meus Produtos. Cada um entra com custo{" "}
            <strong>R$ 0,00</strong> e a marca <strong>&quot;Custo
            pendente&quot;</strong>, ficando fora dos cálculos de DRE,
            Lucratividade e Relatório Tributário até você editar e preencher
            o custo real.
          </p>
        </SheetHeader>

        <SheetBody className="space-y-4">
          {error ? <UserFeedback>{error}</UserFeedback> : null}

          {result ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
              <p>
                <strong>{result.createdCount}</strong> produto
                {result.createdCount === 1 ? "" : "s"} importado
                {result.createdCount === 1 ? "" : "s"}.
              </p>
              {result.skippedExistingCount > 0 ? (
                <p className="mt-1 text-[var(--muted-foreground)]">
                  {result.skippedExistingCount} já estava
                  {result.skippedExistingCount === 1 ? "" : "m"} cadastrado
                  {result.skippedExistingCount === 1 ? "" : "s"}.
                </p>
              ) : null}
              {result.notFoundCount > 0 ? (
                <p className="mt-1 text-[var(--muted-foreground)]">
                  {result.notFoundCount} anúncio
                  {result.notFoundCount === 1 ? "" : "s"} não
                  {result.notFoundCount === 1 ? " foi" : " foram"} encontrado
                  {result.notFoundCount === 1 ? "" : "s"} no Mercado Livre
                  nessa tentativa.
                </p>
              ) : null}
            </div>
          ) : loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Buscando anúncios sem cadastro…
            </p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Nenhum anúncio sem cadastro encontrado no momento.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {suggestions.length} anúncio
                {suggestions.length === 1 ? "" : "s"} sem cadastro encontrado
                {suggestions.length === 1 ? "" : "s"}.
              </p>
              <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                {suggestions.map((s) => (
                  <li
                    key={s.mlItemId}
                    className="truncate rounded px-2 py-1 text-sm text-[var(--muted-foreground)]"
                  >
                    {s.sku ?? s.mlItemId}
                  </li>
                ))}
              </ul>
            </>
          )}
        </SheetBody>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={importing || loading || suggestions.length === 0}
            className="gap-2"
            onClick={() => void importAll()}
          >
            <Download className="size-4" aria-hidden />
            {importing ? "Importando…" : `Importar todos${suggestions.length > 0 ? ` (${suggestions.length})` : ""}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
