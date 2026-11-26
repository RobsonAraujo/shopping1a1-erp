"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgePercent } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormInput } from "@/components/ui/form-input";
import { FormSelect } from "@/components/ui/form-select";
import { Switch } from "@/components/ui/switch";
import { UserFeedback } from "@/components/ui/user-feedback";
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
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MaskedPercentField } from "@/components/shared/FinancialCostInputFields";
import { readApiError } from "@/lib/api/api-client-error";
import { formatFinancialPercent } from "@/lib/pricing/financial-margin";
import type { ProductView } from "@/lib/products/product-data";
import { formatNcm, normalizeNcm } from "@/lib/tax-incentives/ncm";
import type {
  IcmsIncentiveAppliesTo,
  IcmsIncentiveScreenData,
} from "@/lib/tax-incentives/types";
import { taxReportPath } from "@/lib/tax-report/routes";
import { cn } from "@/lib/utils";

export type IcmsIncentiveProductRef = Pick<
  ProductView,
  "mlItemId" | "sku" | "ncm" | "icmsIncentiveExcluded"
>;

export type IcmsIncentiveExclusion = { mlItemId: string; excluded: boolean };

type IcmsIncentiveRuleView = IcmsIncentiveScreenData["rules"][number];

const APPLIES_TO_OPTIONS = [
  { value: "all", label: "Todas as vendas internas" },
  { value: "contribuinte", label: "Só comprador contribuinte (B2B)" },
];

/**
 * O formulário do produto fecha com Esc por um listener em `window`. Esta tela
 * e a confirmação abrem por cima dele: o Esc fecha só elas, sem chegar lá.
 */
function stopEscapePropagation(event: React.KeyboardEvent) {
  if (event.key === "Escape") event.stopPropagation();
}

function appliesToSuffix(appliesTo: IcmsIncentiveAppliesTo): string {
  return appliesTo === "contribuinte" ? ", só para comprador contribuinte" : "";
}

function formatYmd(ymd: string): string {
  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}

function validityLabel(rule: Pick<IcmsIncentiveRuleView, "validFrom" | "validTo">): string | null {
  if (rule.validFrom && rule.validTo) {
    return `de ${formatYmd(rule.validFrom)} a ${formatYmd(rule.validTo)}`;
  }
  if (rule.validFrom) return `a partir de ${formatYmd(rule.validFrom)}`;
  if (rule.validTo) return `até ${formatYmd(rule.validTo)}`;
  return null;
}

/** Regra do NCM digitado e os outros produtos da organização com o mesmo NCM. */
export function useIcmsIncentiveMatch(input: {
  ncm: string;
  mlItemId: string;
  products: readonly IcmsIncentiveProductRef[];
  screen: IcmsIncentiveScreenData | null;
}) {
  const normalized = normalizeNcm(input.ncm);
  const rule = useMemo(
    () =>
      normalized ? input.screen?.rules.find((r) => r.ncm === normalized) : undefined,
    [normalized, input.screen],
  );
  const others = useMemo(
    () =>
      normalized
        ? input.products.filter(
            (p) => p.mlItemId !== input.mlItemId && normalizeNcm(p.ncm) === normalized,
          )
        : [],
    [normalized, input.products, input.mlItemId],
  );
  return { normalized, rule, others };
}

/**
 * Aviso logo abaixo do NCM: o NCM digitado já tem incentivo fiscal de ICMS
 * (produto novo ou NCM trocado). O incentivo é do NCM, então este produto
 * passa a usá-lo — a não ser que o usuário diga que não se aplica.
 */
export function IcmsIncentiveNcmNotice({
  ncm,
  mlItemId,
  excluded,
  onExcludedChange,
  products,
  screen,
}: {
  ncm: string;
  mlItemId: string;
  excluded: boolean;
  onExcludedChange: (excluded: boolean) => void;
  products: readonly IcmsIncentiveProductRef[];
  screen: IcmsIncentiveScreenData | null;
}) {
  const { rule, others } = useIcmsIncentiveMatch({ ncm, mlItemId, products, screen });
  if (!rule || !screen || screen.taxRegime === "SIMPLES") return null;
  const othersLabel =
    others.length === 1 ? "1 outro produto" : `${others.length} outros produtos`;
  return (
    <UserFeedback
      tone="info"
      title="Este NCM já tem incentivo fiscal"
      className="sm:col-span-2"
    >
      <p>
        O NCM {formatNcm(rule.ncm)} tem incentivo de ICMS de{" "}
        {formatFinancialPercent(rule.ratePercent)} nas vendas internas{" "}
        {screen.originUf}
        {appliesToSuffix(rule.appliesTo)}
        {others.length > 0 ? ` (${othersLabel} com esse NCM)` : ""}.{" "}
        {excluded
          ? "Este produto está marcado como \"não se aplica\"."
          : "Este produto também vai usar o incentivo."}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={() => onExcludedChange(!excluded)}
      >
        {excluded ? "Usar o incentivo neste produto" : "Não vale para este produto"}
      </Button>
    </UserFeedback>
  );
}

/**
 * Switch "Incentivo fiscal de ICMS" da seção Classificação fiscal: liga
 * (abre a tela do incentivo do NCM), mostra o resumo, edita e desliga (só
 * deste produto ou do NCM inteiro).
 */
export function IcmsIncentiveCard({
  ncm,
  mlItemId,
  excluded,
  onExcludedChange,
  purchaseIcmsPercent,
  hasIcmsSt,
  products,
  screen,
  onSaved,
  onDeleted,
}: {
  ncm: string;
  mlItemId: string;
  excluded: boolean;
  onExcludedChange: (excluded: boolean) => void;
  purchaseIcmsPercent: number | null;
  hasIcmsSt: boolean;
  products: readonly IcmsIncentiveProductRef[];
  screen: IcmsIncentiveScreenData | null;
  onSaved: (screen: IcmsIncentiveScreenData, exclusions: IcmsIncentiveExclusion[]) => void;
  onDeleted: (screen: IcmsIncentiveScreenData, ncm: string) => void;
}) {
  const { normalized, rule, others } = useIcmsIncentiveMatch({
    ncm,
    mlItemId,
    products,
    screen,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const checked = Boolean(rule) && !excluded;
  const disabled = !normalized || !screen;
  const uf = screen?.originUf ?? "—";

  async function deleteRule() {
    if (!rule) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tax-incentives/${encodeURIComponent(rule.ncm)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "tax_incentive_delete_failed"));
        return;
      }
      const next = (await res.json()) as IcmsIncentiveScreenData;
      onExcludedChange(false);
      onDeleted(next, rule.ncm);
      setSavedNotice(true);
      toast.success(`Incentivo do NCM ${formatNcm(rule.ncm)} removido.`);
    } catch {
      toast.error("Falha de rede ao remover o incentivo.");
    } finally {
      setDeleting(false);
      setConfirmOff(false);
    }
  }

  const description = !normalized
    ? "Preencha o NCM (8 dígitos) para cadastrar. O incentivo vale para o NCM inteiro."
    : `Vendas dentro de ${uf}. Vale para todos os produtos do NCM ${formatNcm(normalized)}.`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 sm:col-span-2">
      <div className="flex items-start justify-between gap-3 px-3.5 py-3">
        <label htmlFor="icms-incentive" className={cn("min-w-0", !disabled && "cursor-pointer")}>
          <p className="text-sm font-medium text-[var(--foreground)]">
            Incentivo fiscal de ICMS
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {description}
          </p>
        </label>
        <Switch
          id="icms-incentive"
          checked={checked}
          disabled={disabled}
          aria-label="Incentivo fiscal de ICMS"
          className="mt-0.5 shrink-0"
          onCheckedChange={(next) => {
            setSavedNotice(false);
            if (next) {
              if (rule) onExcludedChange(false);
              else setDialogOpen(true);
            } else if (rule) {
              setConfirmOff(true);
            }
          }}
        />
      </div>

      {rule ? (
        <div className="space-y-2 border-t border-[var(--border)] px-3.5 py-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          <p>
            <span className="font-semibold text-[var(--foreground)]">
              ICMS de {formatFinancialPercent(rule.ratePercent)}
            </span>{" "}
            nas vendas internas {uf}, no lugar de{" "}
            {formatFinancialPercent(screen?.internalRatePercent ?? 0)} da tabela
            {appliesToSuffix(rule.appliesTo)}
            {validityLabel(rule) ? ` — ${validityLabel(rule)}` : ""}.
            {excluded ? " Marcado como \"não se aplica\" a este produto." : ""}
          </p>
          {rule.note ? <p>Base legal: {rule.note}</p> : null}
          {checked && hasIcmsSt ? (
            <p>
              Este produto tem ICMS-ST na compra: na venda interna o ICMS já é 0%,
              então o incentivo não muda nada nele.
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSavedNotice(false);
              setDialogOpen(true);
            }}
          >
            Editar incentivo do NCM
          </Button>
        </div>
      ) : null}

      {savedNotice ? (
        <div className="border-t border-[var(--border)] px-3.5 py-3">
          <UserFeedback tone="success" title="Salvo" onDismiss={() => setSavedNotice(false)}>
            O Tributário e as margens só mudam depois de &quot;Atualizar
            cálculo&quot; nos meses afetados.{" "}
            <Link
              href={taxReportPath()}
              target="_blank"
              className="font-medium underline underline-offset-2"
            >
              Abrir o Tributário
            </Link>
          </UserFeedback>
        </div>
      ) : null}

      {dialogOpen && normalized && screen ? (
        <IcmsIncentiveDialog
          ncm={normalized}
          rule={rule}
          screen={screen}
          others={others}
          purchaseIcmsPercent={purchaseIcmsPercent}
          hasIcmsSt={hasIcmsSt}
          onClose={() => setDialogOpen(false)}
          onSaved={(next, exclusions) => {
            onExcludedChange(false);
            onSaved(next, exclusions);
            setDialogOpen(false);
            setSavedNotice(true);
          }}
        />
      ) : null}

      <AlertDialog open={confirmOff} onOpenChange={(open) => !open && setConfirmOff(false)}>
        <AlertDialogContent onKeyDown={stopEscapePropagation}>
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar o incentivo fiscal?</AlertDialogTitle>
            <AlertDialogDescription>
              O incentivo é do NCM {rule ? formatNcm(rule.ncm) : ""}
              {others.length > 0
                ? ` e vale também para ${others.length === 1 ? "1 outro produto" : `${others.length} outros produtos`}`
                : ""}
              . Você pode tirar só deste produto (fica como &quot;não se aplica&quot; ao
              salvar o produto) ou remover o incentivo do NCM inteiro agora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => {
                onExcludedChange(true);
                setConfirmOff(false);
              }}
            >
              Só deste produto
            </AlertDialogAction>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void deleteRule();
              }}
            >
              {deleting ? "Removendo…" : "Remover do NCM"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Tela do incentivo do NCM: % final da venda interna, alcance, vigência e produtos. */
function IcmsIncentiveDialog({
  ncm,
  rule,
  screen,
  others,
  purchaseIcmsPercent,
  hasIcmsSt,
  onClose,
  onSaved,
}: {
  ncm: string;
  rule: IcmsIncentiveRuleView | undefined;
  screen: IcmsIncentiveScreenData;
  others: readonly IcmsIncentiveProductRef[];
  purchaseIcmsPercent: number | null;
  hasIcmsSt: boolean;
  onClose: () => void;
  onSaved: (screen: IcmsIncentiveScreenData, exclusions: IcmsIncentiveExclusion[]) => void;
}) {
  const [ratePercent, setRatePercent] = useState<number | null>(rule?.ratePercent ?? null);
  const [appliesTo, setAppliesTo] = useState<IcmsIncentiveAppliesTo>(rule?.appliesTo ?? "all");
  const [validFrom, setValidFrom] = useState(rule?.validFrom ?? "");
  const [validTo, setValidTo] = useState(rule?.validTo ?? "");
  const [note, setNote] = useState(rule?.note ?? "");
  const [applies, setApplies] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      // Regra nova: todos os produtos do NCM entram. Editando: o que está gravado.
      others.map((p) => [p.mlItemId, rule ? !p.icmsIncentiveExcluded : true]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tableRate = screen.internalRatePercent;
  const uf = screen.originUf;
  const rateAboveTable = ratePercent !== null && ratePercent >= tableRate;
  const creditAboveRate =
    ratePercent !== null &&
    !hasIcmsSt &&
    purchaseIcmsPercent !== null &&
    purchaseIcmsPercent > ratePercent;

  async function save() {
    if (ratePercent === null) {
      setError("Informe o ICMS da venda interna, já com o incentivo.");
      return;
    }
    setSaving(true);
    setError(null);
    const exclusions = others.map((p) => ({
      mlItemId: p.mlItemId,
      excluded: !(applies[p.mlItemId] ?? true),
    }));
    try {
      const res = await fetch("/api/tax-incentives", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ncm,
          ratePercent,
          appliesTo,
          validFrom: validFrom || null,
          validTo: validTo || null,
          note: note.trim() || null,
          products: exclusions,
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "tax_incentive_save_failed"));
        return;
      }
      const next = (await res.json()) as IcmsIncentiveScreenData;
      toast.success(`Incentivo do NCM ${formatNcm(ncm)} salvo.`);
      onSaved(next, exclusions);
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="sm:max-w-xl" onKeyDown={stopEscapePropagation}>
        <SheetHeader>
          <SheetTitle>Incentivo fiscal — NCM {formatNcm(ncm)}</SheetTitle>
          <SheetDescription>
            Na venda dentro de {uf}, o ICMS de débito passa a ser o % abaixo no
            lugar dos {formatFinancialPercent(tableRate)} da tabela. O crédito da
            compra continua o &quot;ICMS da compra&quot; do cadastro, e venda para
            outro estado não muda.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {error ? (
            <UserFeedback onDismiss={() => setError(null)}>{error}</UserFeedback>
          ) : null}

          <div className="grid items-start gap-3 sm:grid-cols-2">
            <MaskedPercentField
              id="icms-incentive-rate"
              label="ICMS da venda interna (já com o incentivo)"
              value={ratePercent}
              onValueChange={setRatePercent}
              hint={`O % final que vai na nota, ex.: 12. Substitui os ${formatFinancialPercent(tableRate)} da tabela ${uf}; se houver FCP, inclua aqui.`}
            />
            <FormSelect
              id="icms-incentive-applies-to"
              label="Vale para"
              value={appliesTo}
              onValueChange={(v) => setAppliesTo(v as IcmsIncentiveAppliesTo)}
              options={APPLIES_TO_OPTIONS}
            />
          </div>

          {rateAboveTable ? (
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              Esse % é igual ou maior que o da tabela {uf} (
              {formatFinancialPercent(tableRate)}). Se for uma alíquota própria do NCM,
              está certo; se for incentivo, confira o valor.
            </p>
          ) : null}
          {appliesTo === "contribuinte" ? (
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              Venda interna para consumidor final (CPF ou CNPJ não contribuinte)
              continua com a alíquota da tabela. Use quando o benefício for só de
              atacado/fabricante.
            </p>
          ) : null}
          {creditAboveRate ? (
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              O ICMS da compra deste produto ({formatFinancialPercent(purchaseIcmsPercent)})
              é maior que o da venda com incentivo. O crédito continua integral aqui,
              mas pela regra geral parte dele pode ter que ser estornada — confirme
              com o contador.
            </p>
          ) : null}
          {hasIcmsSt ? (
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              Este produto tem ICMS-ST na compra: na venda interna o ICMS já é 0%, o
              incentivo não muda nada nele.
            </p>
          ) : null}

          <div className="grid items-start gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <DatePicker
                label="Vale a partir de"
                valueYmd={validFrom}
                onChange={setValidFrom}
                disableFuture={false}
                placeholder="Sem data"
              />
              {validFrom ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 py-0 text-xs text-[var(--muted-foreground)] sm:h-auto"
                  onClick={() => setValidFrom("")}
                >
                  Limpar
                </Button>
              ) : null}
            </div>
            <div className="space-y-1">
              <DatePicker
                label="Vale até"
                valueYmd={validTo}
                onChange={setValidTo}
                disableFuture={false}
                placeholder="Sem data"
              />
              {validTo ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 py-0 text-xs text-[var(--muted-foreground)] sm:h-auto"
                  onClick={() => setValidTo("")}
                >
                  Limpar
                </Button>
              ) : null}
            </div>
          </div>
          <p className="-mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
            Sem datas, vale para todas as vendas — inclusive ao recalcular meses
            passados. Se o benefício começou agora, preencha o &quot;a partir de&quot;.
          </p>

          <FormInput
            label="Base legal / observação"
            value={note}
            placeholder="Ex.: RICMS/SP Anexo II, art. 34"
            onChange={(e) => setNote(e.target.value)}
          />

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="size-3.5 text-[var(--muted-foreground)]" aria-hidden />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Outros produtos com este NCM ({others.length})
              </h3>
            </div>
            {others.length === 0 ? (
              <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                Nenhum outro produto cadastrado com este NCM. Quem for cadastrado
                depois com o mesmo NCM já entra com o incentivo.
              </p>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                  O incentivo é do NCM, então vale para eles também. Desligue os
                  produtos em que ele não se aplica (o RICMS lista o benefício por
                  descrição e NCM).
                </p>
                <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                  {others.map((p) => (
                    <li
                      key={p.mlItemId}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.sku ?? p.mlItemId}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{p.mlItemId}</p>
                      </div>
                      <Switch
                        checked={applies[p.mlItemId] ?? true}
                        aria-label={`Incentivo vale para ${p.sku ?? p.mlItemId}`}
                        onCheckedChange={(v) =>
                          setApplies((prev) => ({ ...prev, [p.mlItemId]: v }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar incentivo"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
