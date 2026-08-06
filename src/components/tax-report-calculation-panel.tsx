"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  percentOfSale,
} from "@/lib/financial-margin";
import { margemOperacionalEstimadaLinha } from "@/lib/tax-report/imposto-operacional";
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
    <section
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--background)]",
        className,
      )}
    >
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
          emphasis
            ? "font-semibold text-[var(--foreground)]"
            : "text-[var(--foreground)]",
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
  const outrasDespesas = row.creditoOutrasDespesas;

  const impostoOperacional = row.impostoTotal;
  const impostoPercent = percentOfSale(impostoOperacional, t.receitaBruta);
  const margemOperacional = margemOperacionalEstimadaLinha(row);
  const margemPercent = percentOfSale(margemOperacional, t.receitaBruta);

  const liquidoPisCofinsPercent = pis
    ? percentOfSale(pis.liquido, t.receitaBruta)
    : null;

  const icmsLiquido = icms
    ? icms.icmsTotal - (icmsCred?.creditoTotal ?? 0)
    : null;
  const icmsLiquidoPercent =
    icmsLiquido != null ? percentOfSale(icmsLiquido, t.receitaBruta) : null;

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

      <MemoriaSection title="Dados de entrada" className="mb-3">
        <MemoriaRow
          label="Custo unitário (NF)"
          value={
            t.unitCostNf ? formatFinancialMoney(t.unitCostNf) : "não cadastrado"
          }
          muted={!t.unitCostNf}
        />
        <MemoriaRow
          label="ICMS"
          value={`${t.purchaseIcmsPercent.toFixed(2)}%`}
        />
        {t.hasIcmsSt ? (
          <MemoriaRow
            label="ICMS-ST"
            value={
              t.purchaseCostWithSt
                ? `Sim — custo c/ ST ${formatFinancialMoney(t.purchaseCostWithSt)}`
                : "Sim — custo c/ ST não informado"
            }
          />
        ) : (
          <MemoriaRow label="ICMS-ST" value="Não" muted />
        )}
        <MemoriaRow
          label="IPI"
          value={t.ipiPercent > 0 ? `${t.ipiPercent.toFixed(2)}%` : "0%"}
          muted={t.ipiPercent <= 0}
        />
        <MemoriaDivider />
        <MemoriaRow
          label="Valor da Venda"
          value={formatFinancialMoney(t.receitaBruta)}
          emphasis
        />
      </MemoriaSection>

      <div className="grid gap-3 sm:grid-cols-2">
        {icms || icmsCred ? (
          <MemoriaSection title="ICMS">
            {icms ? (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Débito (venda)
                </p>
                <MemoriaRow
                  label="Operação"
                  value={
                    icms.isOperacaoInterna
                      ? `Interna ${icms.ufOrigem} → ${icms.ufDestino}`
                      : `Interestadual ${icms.ufOrigem} → ${icms.ufDestino}`
                  }
                />
                {icms.isOperacaoInterna ? (
                  icms.icmsStNaCompra ? (
                    <MemoriaRow
                      label="Regime"
                      value="ICMS-ST na compra — ICMS saída 0%"
                      muted
                    />
                  ) : (
                    <MemoriaRow
                      label="Alíquota interna (tabela)"
                      value={`${(icms.aliquotaInternaTotal * 100).toFixed(2)}%`}
                    />
                  )
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
                          label={`DIFAL (${(icms.aliquotaInternaTotal * 100).toFixed(2)}% − ${(icms.aliquotaInterestadual * 100).toFixed(2)}%)`}
                          value={`${Math.max(0, (icms.aliquotaInternaTotal - icms.aliquotaInterestadual) * 100).toFixed(2)}% → ${formatFinancialMoney(icms.difal)}`}
                        />
                      </>
                    )}
                  </>
                )}
                <MemoriaDivider />
                <MemoriaRow
                  label="Débito de ICMS (devido nesta venda)"
                  value={formatFinancialMoney(icms.icmsTotal)}
                  emphasis
                />
                <MemoriaDivider />
              </>
            ) : null}

            {icmsCred
              ? (() => {
                  const stRecuperavel = icmsCred.stRecuperavelTotal ?? 0;
                  const creditoEntrada = icmsCred.creditoTotal - stRecuperavel;
                  return (
                    <>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                        Crédito (compra)
                      </p>
                      {creditoEntrada > 0 ? (
                        <>
                          <MemoriaRow
                            label="Base NF entrada"
                            value={formatFinancialMoney(icmsCred.baseUnitaria)}
                          />
                          <MemoriaRow
                            label="Alíquota entrada"
                            value={`${icmsCred.aliquotaPercent.toFixed(2)}%`}
                          />
                        </>
                      ) : (
                        <MemoriaRow
                          label="Crédito de ICMS entrada"
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
                      {stRecuperavel > 0 ? (
                        <>
                          <MemoriaRow
                            label={`Custo com ICMS-ST (× ${t.quantidade})`}
                            value={formatFinancialMoney(
                              (t.purchaseCostWithSt ?? 0) * t.quantidade,
                            )}
                            muted
                          />
                          <MemoriaRow
                            label={`(−) Custo NF sem ST (× ${t.quantidade})`}
                            value={formatFinancialMoney(
                              (t.unitCostNf ?? 0) * t.quantidade,
                            )}
                            muted
                          />
                          <MemoriaRow
                            label="ICMS-ST recuperável (venda interestadual — Tema 201/STF)"
                            value={formatFinancialMoney(stRecuperavel)}
                            muted
                          />
                        </>
                      ) : null}
                      <MemoriaDivider />
                      <MemoriaRow
                        label="Crédito de ICMS (abate o débito)"
                        value={formatFinancialMoney(icmsCred.creditoTotal)}
                        emphasis
                      />
                    </>
                  );
                })()
              : null}

            {icms && icmsCred ? (
              <>
                <MemoriaDivider />
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Líquido
                </p>
                <MemoriaRow
                  label="Débito de ICMS (venda)"
                  value={formatFinancialMoney(icms.icmsTotal)}
                />
                <MemoriaRow
                  label="(−) Crédito de ICMS (compra)"
                  value={formatFinancialMoney(icmsCred.creditoTotal)}
                  muted
                />
                <MemoriaDivider />
                <MemoriaRow
                  label="ICMS líquido a recolher nesta venda"
                  value={
                    icmsLiquidoPercent != null
                      ? `${formatFinancialPercent(icmsLiquidoPercent)} (${formatFinancialMoney(icmsLiquido ?? 0)})`
                      : formatFinancialMoney(icmsLiquido ?? 0)
                  }
                  emphasis
                />
                {(icmsCred.stRecuperavelTotal ?? 0) > 0 ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Este líquido já desconta{" "}
                    {formatFinancialMoney(icmsCred.stRecuperavelTotal ?? 0)} de
                    ICMS-ST recuperável — um crédito estimado que depende do
                    processo de ressarcimento junto ao estado de origem.
                  </p>
                ) : null}
              </>
            ) : null}
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
                  label={`PIS débito (${pis.pisRatePercent}%)`}
                  value={formatFinancialMoney(pis.pisDebito)}
                />
                <MemoriaRow
                  label={`COFINS débito (${pis.cofinsRatePercent}%)`}
                  value={formatFinancialMoney(pis.cofinsDebito)}
                />
                <MemoriaDivider />
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Crédito
                </p>
                <MemoriaRow
                  label="Base (custo NF total)"
                  value={formatFinancialMoney(pis.baseCredito)}
                />
                <MemoriaRow
                  label={`PIS crédito (${pis.pisRatePercent}%)`}
                  value={formatFinancialMoney(pis.pisCredito)}
                />
                <MemoriaRow
                  label={`COFINS crédito (${pis.cofinsRatePercent}%)`}
                  value={formatFinancialMoney(pis.cofinsCredito)}
                />
                <MemoriaDivider />
                <MemoriaRow
                  label="PIS/COFINS líquido"
                  value={
                    liquidoPisCofinsPercent != null
                      ? `${formatFinancialPercent(liquidoPisCofinsPercent)} (${formatFinancialMoney(pis.liquido)})`
                      : formatFinancialMoney(pis.liquido)
                  }
                  emphasis
                />
              </>
            )}
          </MemoriaSection>
        ) : null}

        {outrasDespesas && outrasDespesas.creditoTotal > 0 ? (
          <MemoriaSection
            title="Créditos adicionais (Meli/ADS)"
            className="sm:col-span-2"
          >
            {outrasDespesas.meliFee.base > 0 ? (
              <MemoriaRow
                label={`Tarifa Meli × ${outrasDespesas.meliFee.aliquotaPercent.toFixed(2)}%`}
                value={`${formatFinancialMoney(outrasDespesas.meliFee.base)} → ${formatFinancialMoney(outrasDespesas.meliFee.credito)}`}
              />
            ) : null}
            {outrasDespesas.ads.receitaMesItem > 0 ? (
              <MemoriaRow
                label={`ADS rateado (${formatFinancialMoney(outrasDespesas.ads.gastoAdsMesItem)} no mês do anúncio) × ${outrasDespesas.ads.aliquotaPercent.toFixed(2)}%`}
                value={`${formatFinancialMoney(outrasDespesas.ads.base)} → ${formatFinancialMoney(outrasDespesas.ads.credito)}`}
              />
            ) : null}
            <MemoriaDivider />
            <MemoriaRow
              label="Crédito total (abate o imposto operacional)"
              value={formatFinancialMoney(outrasDespesas.creditoTotal)}
              emphasis
            />
          </MemoriaSection>
        ) : null}
      </div>

      {row.incluidoNaApuracao ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
          <span className="text-xs text-[var(--muted-foreground)]">
            Imposto operacional
            {pis && icms ? (
              <span className="block text-[10px] normal-case text-[var(--muted-foreground)]/80">
                PIS/COFINS líquido (
                {formatFinancialPercent(
                  percentOfSale(pis.liquido, t.receitaBruta),
                )}{" "}
                · {formatFinancialMoney(pis.liquido)}) + ICMS líquido (
                {icmsLiquidoPercent != null
                  ? formatFinancialPercent(icmsLiquidoPercent)
                  : "—"}{" "}
                · {formatFinancialMoney(icmsLiquido ?? 0)})
                {outrasDespesas && outrasDespesas.creditoTotal > 0
                  ? ` − Créditos Meli/ADS (${formatFinancialMoney(outrasDespesas.creditoTotal)})`
                  : ""}
              </span>
            ) : null}
          </span>
          <span className="flex flex-col items-end text-right tabular-nums">
            <span className="text-lg font-semibold">
              {formatFinancialPercent(impostoPercent)}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {formatFinancialMoney(impostoOperacional)} da receita
            </span>
          </span>
          <span className="flex w-full flex-col items-end text-right tabular-nums sm:ml-auto sm:w-auto">
            <span className="text-xs text-[var(--muted-foreground)]">
              Margem operacional
            </span>
            <span className="font-medium">
              {formatFinancialMoney(margemOperacional)}
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
