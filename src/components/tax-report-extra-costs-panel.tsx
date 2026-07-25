"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import { formatFinancialMoney } from "@/lib/financial-margin";
import {
  EXTRA_COST_CATEGORY_LABELS,
  extraCostsStorageKey,
  sumExtraCosts,
  type ExtraCostCategory,
  type MonthlyExtraCost,
} from "@/lib/tax-report/extra-costs";

const CATEGORY_OPTIONS = Object.entries(EXTRA_COST_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const EMPTY_EXTRA_COSTS: MonthlyExtraCost[] = [];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TaxReportExtraCostsPanel({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const [costs, setCosts] = usePersistedJson<MonthlyExtraCost[]>(
    extraCostsStorageKey(year, month),
    EMPTY_EXTRA_COSTS,
  );

  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<ExtraCostCategory>("frete");
  const [valor, setValor] = useState("");

  const total = sumExtraCosts(costs);

  function handleAdd() {
    const valorNumero = Number(valor.replace(",", "."));
    if (!descricao.trim() || !Number.isFinite(valorNumero) || valorNumero <= 0) {
      return;
    }
    setCosts([
      ...costs,
      { id: newId(), descricao: descricao.trim(), categoria, valor: valorNumero },
    ]);
    setDescricao("");
    setValor("");
  }

  function handleRemove(id: string) {
    setCosts(costs.filter((c) => c.id !== id));
  }

  return (
    <Card className="p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold">Custos mensais extras (crédito PIS/COFINS)</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Frete, embalagem, energia, aluguel etc. — despesas sem nota fiscal por SKU que
          também geram crédito no regime não-cumulativo (Lei 10.637/02, Lei 10.833/03).
        </p>
      </div>

      {costs.length > 0 ? (
        <ul className="mb-3 space-y-1.5">
          {costs.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.descricao}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {EXTRA_COST_CATEGORY_LABELS[c.categoria]}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums">{formatFinancialMoney(c.valor)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleRemove(c.id)}
                  aria-label={`Remover ${c.descricao}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-[var(--muted-foreground)]">
          Nenhum custo cadastrado para este mês.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
        <label className="text-sm">
          <span className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)]">
            Descrição
          </span>
          <input
            className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm shadow-sm"
            placeholder="Ex.: Frete Correios junho"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        <FormSelect
          id="extra-cost-categoria"
          label="Categoria"
          value={categoria}
          onValueChange={(value) => setCategoria(value as ExtraCostCategory)}
          options={CATEGORY_OPTIONS}
          triggerClassName="w-full"
        />
        <label className="text-sm">
          <span className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)]">
            Valor (R$)
          </span>
          <input
            className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm shadow-sm"
            placeholder="0,00"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </label>
        <Button type="button" onClick={handleAdd} className="h-10">
          Adicionar
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
        <span className="text-xs text-[var(--muted-foreground)]">Total do mês</span>
        <span className="font-semibold tabular-nums">{formatFinancialMoney(total)}</span>
      </div>

      <p className="mt-3 text-[10px] text-[var(--muted-foreground)]">
        Ajusta apenas o PIS/COFINS geral do mês (Apuração estimada) — não aparece na memória de
        cálculo por produto. Salvo neste navegador (localStorage); ainda não sincroniza entre
        dispositivos.
      </p>
    </Card>
  );
}
