"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatFinancialMoney, formatFinancialPercent, percentOfSale } from "@/lib/financial-margin";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

function MemoriaSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-[var(--border)] bg-[var(--background)]", className)}>
      <h3 className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {title}
      </h3>
      <div className="space-y-1.5 px-3 py-2.5 text-sm">{children}</div>
    </section>
  );
}

function MemoriaRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4",
        muted && "text-[var(--muted-foreground)]",
      )}
    >
      <span className="text-xs">{label}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          emphasis ? "font-semibold text-[var(--foreground)]" : "text-[var(--foreground)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MemoriaDivider() {
  return <div className="my-1 border-t border-dashed border-[var(--border)]" />;
}

export function TaxReportCalculationPanel({
  row,
  onClose,
}: {
  row: DetalhamentoTributario;
  onClose: () => void;
}) {
  const t = row.transacao;
  const icms = row.icmsDifal;
  const pis = row.pisCofins;
  const icmsCred = row.icmsCreditoCompra;
  const irpj = row.irpjCsll;

  const impostoPercent = percentOfSale(row.impostoTotal, t.receitaBruta);
  const margemPercent = percentOfSale(row.margemLiquidaEstimada, t.receitaBruta);

  const saidaPct =
    icms?.aliquotaSaidaEfetiva != null
      ? icms.aliquotaSaidaEfetiva * 100
      : icms
        ? icms.aliquotaInternaTotal * 100
        : null;

  return (
    <Card className="border-[var(--primary)]/20 bg-[var(--muted)]/10 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Memória de cálculo</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {t.orderDate.slice(0, 10)} · Pedido {t.orderId} · SKU {t.sku}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t.ufDestino ?? "UF —"} · {t.tipoDocumento} · Qtd {t.quantidade}
            {t.hasIcmsSt ? " · ICMS-ST na compra" : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={onClose}
          aria-label="Fechar memória de cálculo"
        >
          <X className="size-4" />
        </Button>
      </div>

      {t.dadosFiscaisIndisponiveis ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Dados fiscais indisponíveis no Mercado Livre — venda excluída da
          apuração até revisão manual.
        </p>
      ) : null}

      {!t.unitCostNf && row.incluidoNaApuracao ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          SKU sem custo NF cadastrado — créditos PIS/COFINS e ICMS de compra
          zerados nesta linha.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <MemoriaSection title="Receita">
          <MemoriaRow
            label="Receita bruta"
            value={formatFinancialMoney(t.receitaBruta)}
            emphasis
          />
        </MemoriaSection>

        {icms ? (
          <MemoriaSection title="ICMS / DIFAL">
            <MemoriaRow
              label="Operação"
              value={
                icms.isOperacaoInterna
                  ? `Interna ${icms.ufOrigem} → ${icms.ufDestino}`
                  : `Interestadual ${icms.ufOrigem} → ${icms.ufDestino}`
              }
            />
            {icms.isOperacaoInterna ? (
              <>
                {icms.icmsStNaCompra ? (
                  <MemoriaRow
                    label="Regime"
                    value="ICMS-ST na compra (alíquota residual na saída)"
                    muted
                  />
                ) : null}
                {icms.aliquotaSaidaEfetiva != null &&
                Math.abs(icms.aliquotaSaidaEfetiva - icms.aliquotaInternaTotal) >
                  0.0001 ? (
                  <>
                    <MemoriaRow
                      label="Alíquota tabela UF"
                      value={`${(icms.aliquotaInternaTotal * 100).toFixed(2)}%`}
                      muted
                    />
                    <MemoriaRow
                      label="Alíquota saída (cadastro)"
                      value={`${saidaPct!.toFixed(2)}%`}
                    />
                  </>
                ) : (
                  <MemoriaRow
                    label="Alíquota saída"
                    value={`${saidaPct!.toFixed(2)}%`}
                  />
                )}
                <MemoriaDivider />
                <MemoriaRow
                  label="ICMS saída"
                  value={formatFinancialMoney(icms.icmsTotal)}
                  emphasis
                />
              </>
            ) : (
              <>
                <MemoriaRow
                  label="ICMS interestadual"
                  value={`${(icms.aliquotaInterestadual * 100).toFixed(2)}% → ${formatFinancialMoney(icms.icmsInterestadual)}`}
                />
                {icms.isContribuinte ? (
                  <MemoriaRow
                    label="DIFAL"
                    value="Não (comprador contribuinte)"
                    muted
                  />
                ) : (
                  <>
                    <MemoriaRow
                      label="Alíquota interna destino"
                      value={`${(icms.aliquotaInternaTotal * 100).toFixed(2)}%`}
                      muted
                    />
                    <MemoriaRow
                      label="DIFAL"
                      value={formatFinancialMoney(icms.difal)}
                    />
                  </>
                )}
                <MemoriaDivider />
                <MemoriaRow
                  label="ICMS total"
                  value={formatFinancialMoney(icms.icmsTotal)}
                  emphasis
                />
              </>
            )}
          </MemoriaSection>
        ) : null}

        {icmsCred ? (
          <MemoriaSection title="Crédito ICMS compra">
            {icmsCred.creditoTotal > 0 ? (
              <>
                <MemoriaRow
                  label="Base NF entrada"
                  value={formatFinancialMoney(icmsCred.baseUnitaria)}
                />
                <MemoriaRow
                  label="Alíquota entrada"
                  value={`${icmsCred.aliquotaPercent.toFixed(2)}%`}
                />
                <MemoriaDivider />
                <MemoriaRow
                  label="Crédito"
                  value={formatFinancialMoney(icmsCred.creditoTotal)}
                  emphasis
                />
              </>
            ) : (
              <MemoriaRow
                label="Crédito"
                value={
                  t.hasIcmsSt
                    ? "R$ 0,00 (ST na compra)"
                    : t.unitCostNf
                      ? "R$ 0,00"
                      : "R$ 0,00 (sem custo NF)"
                }
                muted
              />
            )}
          </MemoriaSection>
        ) : null}

        {pis ? (
          <MemoriaSection title="PIS / COFINS">
            {t.isMonophasic ? (
              <MemoriaRow label="Regime" value="Monofásico — isento" muted />
            ) : (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Débito
                </p>
                <MemoriaRow
                  label="Base"
                  value={formatFinancialMoney(pis.baseDebito)}
                />
                {pis.icmsExcluidoDaBase > 0 ? (
                  <MemoriaRow
                    label="(−) ICMS excluído (RE 574.706)"
                    value={formatFinancialMoney(pis.icmsExcluidoDaBase)}
                    muted
                  />
                ) : null}
                <MemoriaRow
                  label="PIS débito"
                  value={formatFinancialMoney(pis.pisDebito)}
                />
                <MemoriaRow
                  label="COFINS débito"
                  value={formatFinancialMoney(pis.cofinsDebito)}
                />
                <MemoriaDivider />
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Crédito
                </p>
                <MemoriaRow
                  label="Base (NF − ICMS entrada)"
                  value={formatFinancialMoney(pis.baseCredito)}
                />
                <MemoriaRow
                  label="PIS crédito"
                  value={formatFinancialMoney(pis.pisCredito)}
                />
                <MemoriaRow
                  label="COFINS crédito"
                  value={formatFinancialMoney(pis.cofinsCredito)}
                />
                <MemoriaDivider />
                <MemoriaRow
                  label="PIS/COFINS líquido"
                  value={formatFinancialMoney(pis.liquido)}
                  emphasis
                />
              </>
            )}
          </MemoriaSection>
        ) : null}

        {irpj ? (
          <MemoriaSection title="IRPJ / CSLL (estimativa)">
            <MemoriaRow
              label="Base de lucro"
              value={formatFinancialMoney(irpj.baseLucro)}
            />
            <MemoriaRow
              label="IRPJ 15%"
              value={formatFinancialMoney(irpj.irpjTotal)}
            />
            <MemoriaRow label="CSLL 9%" value={formatFinancialMoney(irpj.csll)} />
            <p className="pt-1 text-[10px] text-[var(--muted-foreground)]">
              Estimativa gerencial — não substitui LALUR/e-Lalur.
            </p>
          </MemoriaSection>
        ) : null}
      </div>

      {row.incluidoNaApuracao ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
          <span className="text-xs text-[var(--muted-foreground)]">
            Imposto total estimado
          </span>
          <span className="flex flex-col items-end text-right tabular-nums">
            <span className="font-semibold">
              {formatFinancialMoney(row.impostoTotal)}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {formatFinancialPercent(impostoPercent)} da receita
            </span>
          </span>
          <span className="flex w-full flex-col items-end text-right tabular-nums sm:ml-auto sm:w-auto">
            <span className="text-xs text-[var(--muted-foreground)]">
              Margem líquida est.
            </span>
            <span className="font-medium">
              {formatFinancialMoney(row.margemLiquidaEstimada)}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {formatFinancialPercent(margemPercent)} da receita
            </span>
          </span>
        </div>
      ) : null}
    </Card>
  );
}
