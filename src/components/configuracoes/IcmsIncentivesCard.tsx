"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgePercent, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { readApiError } from "@/lib/api/api-client-error";
import { formatFinancialPercent } from "@/lib/pricing/financial-margin";
import { formatNcm } from "@/lib/tax-incentives/ncm";
import type { IcmsIncentiveScreenData } from "@/lib/tax-incentives/types";

type Rule = IcmsIncentiveScreenData["rules"][number];

function formatYmd(ymd: string): string {
  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}

function ruleDetails(rule: Rule): string {
  const parts = [
    rule.appliesTo === "contribuinte" ? "só contribuinte" : "todas as vendas internas",
  ];
  if (rule.validFrom) parts.push(`desde ${formatYmd(rule.validFrom)}`);
  if (rule.validTo) parts.push(`até ${formatYmd(rule.validTo)}`);
  parts.push(rule.productCount === 1 ? "1 produto" : `${rule.productCount} produtos`);
  return parts.join(" · ");
}

/**
 * Incentivos fiscais de ICMS por NCM da organização (cadastrados em Meus
 * produtos). Aqui só se audita e remove — inclusive regra cujo NCM já não
 * tem produto nenhum.
 */
export function IcmsIncentivesCard() {
  const [data, setData] = useState<IcmsIncentiveScreenData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/tax-incentives");
        if (!res.ok) return;
        const json = (await res.json()) as IcmsIncentiveScreenData;
        if (!cancelled) setData(json);
      } catch {
        // Lista fica vazia; o resto da página segue funcionando.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(rule: Rule) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tax-incentives/${encodeURIComponent(rule.ncm)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "tax_incentive_delete_failed"));
        return;
      }
      setData((await res.json()) as IcmsIncentiveScreenData);
      toast.success(`Incentivo do NCM ${formatNcm(rule.ncm)} removido.`);
    } catch {
      toast.error("Falha de rede ao remover o incentivo.");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  const rules = data?.rules ?? [];

  return (
    <Card className="overflow-hidden rounded-2xl p-0">
      <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-900">
          <BadgePercent className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Incentivos fiscais por NCM
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Na venda interna{data ? ` (${data.originUf} → ${data.originUf})` : ""}, o ICMS
            do produto com incentivo é o % cadastrado no lugar da alíquota da tabela.
            Cadastre e edite pelo produto em{" "}
            <Link href="/dashboard/produtos" className="font-medium underline underline-offset-2">
              Meus produtos
            </Link>
            .
          </p>
        </div>
      </div>
      {rules.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[var(--muted-foreground)] sm:px-5">
          Nenhum incentivo cadastrado.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rules.map((rule) => (
            <li
              key={rule.ncm}
              className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums">
                  NCM {formatNcm(rule.ncm)} ·{" "}
                  {formatFinancialPercent(rule.ratePercent)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  {ruleDetails(rule)}
                  {rule.note ? ` · ${rule.note}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1.5"
                disabled={deleting}
                onClick={() => setPendingDelete(rule)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o incentivo?</AlertDialogTitle>
            <AlertDialogDescription>
              O NCM {pendingDelete ? formatNcm(pendingDelete.ncm) : ""} volta a usar a
              alíquota da tabela nas vendas internas. O Tributário só muda depois de
              &quot;Atualizar cálculo&quot; nos meses afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) void remove(pendingDelete);
              }}
            >
              {deleting ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
