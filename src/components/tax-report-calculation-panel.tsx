"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  percentOfSale,
} from "@/lib/financial-margin";
import { margemOperacionalEstimadaLinha } from "@/lib/tax-report/imposto-operacional";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

const SHOW_DETAILS_STORAGE_KEY = "tax-report-calc-panel:show-details";
const SHOW_DETAILS_CHANGE_EVENT = "tax-report-calc-panel-show-details-change";

function readStoredShowDetails(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_DETAILS_STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function subscribeToShowDetailsStore(onStoreChange: () => void) {
  window.addEventListener(SHOW_DETAILS_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(SHOW_DETAILS_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function useShowCalculationDetails() {
  const showDetails = useSyncExternalStore(
    subscribeToShowDetailsStore,
    readStoredShowDetails,
    () => true,
  );

  const setShowDetails = useCallback((value: boolean) => {
    try {
      localStorage.setItem(SHOW_DETAILS_STORAGE_KEY, value ? "1" : "0");
    } catch {
      // ignore quota / private mode
    }
    window.dispatchEvent(new Event(SHOW_DETAILS_CHANGE_EVENT));
  }, []);

  return { showDetails, setShowDetails };
}

const ShowDetailsContext = createContext(true);

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
  conta,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  /** Conta explícita que originou o valor, ex.: "R$ 100,00 × 18% = R$ 18,00". */
  conta?: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  const showDetails = useContext(ShowDetailsContext);
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5",
        muted && "text-[var(--muted-foreground)]",
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
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
      {conta && showDetails ? (
        <span className="self-end font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]/80">
          {conta}
        </span>
      ) : null}
    </div>
  );
}

function MemoriaDivider() {
  return <div className="my-1 border-t border-dashed border-[var(--border)]" />;
}

function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function money(value: number): string {
  return formatFinancialMoney(value);
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

  const pisCofinsLiquidoFinal = pis
    ? pis.liquido - (outrasDespesas?.creditoTotal ?? 0)
    : 0;
  const pisCofinsLiquidoFinalPercent = pis
    ? percentOfSale(pisCofinsLiquidoFinal, t.receitaBruta)
    : null;

  const icmsLiquido = icms
    ? icms.icmsTotal - (icmsCred?.creditoTotal ?? 0)
    : null;
  const icmsLiquidoPercent =
    icmsLiquido != null ? percentOfSale(icmsLiquido, t.receitaBruta) : null;

  const cmvTotal =
    (t.custoAquisicaoUnitario ?? 0) * t.quantidade +
    t.extraCostsUnitario * t.quantidade;

  const { showDetails, setShowDetails } = useShowCalculationDetails();

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
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span>Mostrar detalhes das contas</span>
            <Switch
              checked={showDetails}
              onCheckedChange={setShowDetails}
              aria-label="Mostrar detalhes das contas"
            />
          </label>
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
      </div>

      <ShowDetailsContext.Provider value={showDetails}>

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
        {showDetails ? (
          <p className="mb-1 text-[11px] text-[var(--muted-foreground)]">
            Estes são os dados usados nas contas abaixo — nenhum deles é
            calculado, vêm direto do cadastro do produto e da venda.
          </p>
        ) : null}
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
                      conta="O imposto desta venda já foi recolhido antecipadamente na compra (substituição tributária), por isso não há novo débito agora."
                      muted
                    />
                  ) : (
                    <MemoriaRow
                      label="Débito de ICMS"
                      value={money(icms.icmsTotal)}
                      conta={`${money(t.receitaBruta)} × ${pct(icms.aliquotaInternaTotal * 100)} = ${money(icms.icmsTotal)}`}
                      emphasis
                    />
                  )
                ) : (
                  <>
                    <MemoriaRow
                      label="ICMS interestadual"
                      value={money(icms.icmsInterestadual)}
                      conta={`${money(t.receitaBruta)} × ${pct(icms.aliquotaInterestadual * 100)} = ${money(icms.icmsInterestadual)}`}
                    />
                    {icms.isContribuinte ? (
                      <MemoriaRow
                        label="DIFAL"
                        value="Não (comprador contribuinte)"
                        conta="Quando quem compra também recolhe ICMS (CNPJ contribuinte), a diferença de alíquota (DIFAL) não é cobrada nesta venda."
                        muted
                      />
                    ) : (
                      <MemoriaRow
                        label="DIFAL (diferença de alíquota)"
                        value={money(icms.difal)}
                        conta={`${money(t.receitaBruta)} × (${pct(icms.aliquotaInternaTotal * 100)} alíquota do estado do comprador − ${pct(icms.aliquotaInterestadual * 100)} já cobrada acima) = ${money(icms.difal)}`}
                      />
                    )}
                    <MemoriaDivider />
                    <MemoriaRow
                      label="Débito de ICMS (devido nesta venda)"
                      value={money(icms.icmsTotal)}
                      conta={`ICMS interestadual (${money(icms.icmsInterestadual)}) + DIFAL (${money(icms.difal)}) = ${money(icms.icmsTotal)}`}
                      emphasis
                    />
                  </>
                )}
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
                        <MemoriaRow
                          label="Crédito de ICMS entrada"
                          value={money(creditoEntrada)}
                          conta={`Base NF entrada (${money(icmsCred.baseUnitaria)}) × ${pct(icmsCred.aliquotaPercent)} = ${money(creditoEntrada)}`}
                        />
                      ) : (
                        <MemoriaRow
                          label="Crédito de ICMS entrada"
                          value="R$ 0,00"
                          conta={
                            t.hasIcmsSt
                              ? "Zerado porque o ICMS já foi pago por substituição tributária (ST) na compra."
                              : t.unitCostNf
                                ? "Zerado — este produto não teve ICMS de entrada informado."
                                : "Zerado — SKU sem custo de NF cadastrado."
                          }
                          muted
                        />
                      )}
                      {stRecuperavel > 0 ? (
                        <MemoriaRow
                          label="ICMS-ST recuperável"
                          value={money(stRecuperavel)}
                          conta={`Custo pago com ICMS-ST (${money((t.purchaseCostWithSt ?? 0) * t.quantidade)}) − Custo sem ST (${money((t.unitCostNf ?? 0) * t.quantidade)}) = ${money(stRecuperavel)} — venda interestadual, o ICMS-ST pago a mais na compra pode ser recuperado (Tema 201/STF)`}
                          muted
                        />
                      ) : null}
                      <MemoriaDivider />
                      <MemoriaRow
                        label="Crédito de ICMS (abate o débito)"
                        value={money(icmsCred.creditoTotal)}
                        conta={
                          stRecuperavel > 0
                            ? `Crédito de entrada (${money(creditoEntrada)}) + ICMS-ST recuperável (${money(stRecuperavel)}) = ${money(icmsCred.creditoTotal)}`
                            : undefined
                        }
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
                  Líquido — o que você deve, menos o que já pagou na compra
                </p>
                <MemoriaRow
                  label="ICMS líquido a recolher nesta venda"
                  value={
                    icmsLiquidoPercent != null
                      ? `${formatFinancialPercent(icmsLiquidoPercent)} (${money(icmsLiquido ?? 0)})`
                      : money(icmsLiquido ?? 0)
                  }
                  conta={`Débito (${money(icms.icmsTotal)}) − Crédito (${money(icmsCred.creditoTotal)}) = ${money(icmsLiquido ?? 0)}`}
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
                  Débito — imposto sobre o valor da venda
                </p>
                {pis.icmsExcluidoDaBase > 0 ? (
                  <MemoriaRow
                    label="Base de cálculo"
                    value={money(pis.baseDebito)}
                    conta={`Valor da venda (${money(t.receitaBruta)}) − ICMS excluído (${money(pis.icmsExcluidoDaBase)}) = ${money(pis.baseDebito)} (por decisão do STF, RE 574.706, o ICMS não entra na base de PIS/COFINS)`}
                  />
                ) : (
                  <MemoriaRow
                    label="Base de cálculo"
                    value={money(pis.baseDebito)}
                    conta="É o próprio valor da venda"
                    muted
                  />
                )}
                <MemoriaRow
                  label={`PIS débito`}
                  value={money(pis.pisDebito)}
                  conta={`${money(pis.baseDebito)} × ${pct(pis.pisRatePercent)} = ${money(pis.pisDebito)}`}
                />
                <MemoriaRow
                  label={`COFINS débito`}
                  value={money(pis.cofinsDebito)}
                  conta={`${money(pis.baseDebito)} × ${pct(pis.cofinsRatePercent)} = ${money(pis.cofinsDebito)}`}
                />
                <MemoriaDivider />
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Crédito — abate por já ter pago PIS/COFINS na compra
                </p>
                <MemoriaRow
                  label="Base de cálculo"
                  value={money(pis.baseCredito)}
                  conta="Custo unitário (NF) total pago na compra, sem descontar o ICMS"
                  muted
                />
                <MemoriaRow
                  label={`PIS crédito`}
                  value={money(pis.pisCredito)}
                  conta={`${money(pis.baseCredito)} × ${pct(pis.pisRatePercent)} = ${money(pis.pisCredito)}`}
                />
                <MemoriaRow
                  label={`COFINS crédito`}
                  value={money(pis.cofinsCredito)}
                  conta={`${money(pis.baseCredito)} × ${pct(pis.cofinsRatePercent)} = ${money(pis.cofinsCredito)}`}
                />
                <MemoriaDivider />
                <MemoriaRow
                  label={
                    outrasDespesas && outrasDespesas.creditoTotal > 0
                      ? "PIS/COFINS líquido (antes dos créditos Meli/ADS/Frete)"
                      : "PIS/COFINS líquido"
                  }
                  value={
                    liquidoPisCofinsPercent != null
                      ? `${formatFinancialPercent(liquidoPisCofinsPercent)} (${money(pis.liquido)})`
                      : money(pis.liquido)
                  }
                  conta={`Débito (${money(pis.pisDebito + pis.cofinsDebito)}) − Crédito (${money(pis.pisCredito + pis.cofinsCredito)}) = ${money(pis.liquido)}`}
                  emphasis={!(outrasDespesas && outrasDespesas.creditoTotal > 0)}
                />

                {outrasDespesas && outrasDespesas.creditoTotal > 0 ? (
                  <>
                    <MemoriaDivider />
                    <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      (−) Créditos sobre tarifa Meli, ADS e Frete
                    </p>
                    {showDetails ? (
                      <p className="mb-1 text-[11px] text-[var(--muted-foreground)]">
                        Também dá direito a crédito de PIS/COFINS o que você
                        paga de tarifa ao Mercado Livre, o que gasta em
                        anúncios patrocinados (ADS) e o frete que a empresa
                        paga na venda.
                      </p>
                    ) : null}
                    {outrasDespesas.meliFee.base > 0 ? (
                      <MemoriaRow
                        label="Crédito sobre tarifa do Mercado Livre"
                        value={money(outrasDespesas.meliFee.credito)}
                        conta={`Tarifa paga nesta venda (${money(outrasDespesas.meliFee.base)}) × ${pct(outrasDespesas.meliFee.aliquotaPercent)} = ${money(outrasDespesas.meliFee.credito)}`}
                      />
                    ) : null}
                    {outrasDespesas.ads.receitaMesItem > 0 ? (
                      <>
                        <MemoriaRow
                          label="Parte do gasto em ADS atribuída a esta venda"
                          value={money(outrasDespesas.ads.base)}
                          conta={`Gasto do anúncio no mês (${money(outrasDespesas.ads.gastoAdsMesItem)}) ÷ Receita do anúncio no mês (${money(outrasDespesas.ads.receitaMesItem)}) × Valor desta venda (${money(t.receitaBruta)}) = ${money(outrasDespesas.ads.base)}`}
                          muted
                        />
                        <MemoriaRow
                          label="Crédito sobre o gasto em ADS"
                          value={money(outrasDespesas.ads.credito)}
                          conta={`${money(outrasDespesas.ads.base)} × ${pct(outrasDespesas.ads.aliquotaPercent)} = ${money(outrasDespesas.ads.credito)}`}
                        />
                      </>
                    ) : null}
                    {outrasDespesas.frete.base > 0 ? (
                      <MemoriaRow
                        label="Crédito sobre frete pago na venda"
                        value={money(outrasDespesas.frete.credito)}
                        conta={`Frete pago nesta venda (${money(outrasDespesas.frete.base)}) × ${pct(outrasDespesas.frete.aliquotaPercent)} = ${money(outrasDespesas.frete.credito)}`}
                      />
                    ) : null}
                    <MemoriaDivider />
                    <MemoriaRow
                      label="PIS/COFINS líquido final"
                      value={
                        pisCofinsLiquidoFinalPercent != null
                          ? `${formatFinancialPercent(pisCofinsLiquidoFinalPercent)} (${money(pisCofinsLiquidoFinal)})`
                          : money(pisCofinsLiquidoFinal)
                      }
                      conta={`PIS/COFINS líquido (${money(pis.liquido)}) − Créditos Meli/ADS/Frete (${money(outrasDespesas.creditoTotal)}) = ${money(pisCofinsLiquidoFinal)}`}
                      emphasis
                    />
                  </>
                ) : null}
              </>
            )}
          </MemoriaSection>
        ) : null}
      </div>

      {row.incluidoNaApuracao ? (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Imposto operacional — soma de tudo que foi calculado acima
            </p>
            <span className="flex shrink-0 flex-col items-end text-right tabular-nums">
              <span className="text-lg font-semibold">
                {formatFinancialPercent(impostoPercent)}
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {money(impostoOperacional)} da venda
              </span>
            </span>
          </div>

          {pis && icms && showDetails ? (
            <div className="space-y-1 border-t border-dashed border-[var(--border)] pt-2 font-mono text-[11px] text-[var(--muted-foreground)]">
              <div className="flex justify-between gap-3">
                <span>
                  PIS/COFINS líquido
                  {outrasDespesas && outrasDespesas.creditoTotal > 0
                    ? " (já com créditos Meli/ADS/Frete)"
                    : ""}
                </span>
                <span className="tabular-nums">
                  {money(pisCofinsLiquidoFinal)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>+ ICMS líquido</span>
                <span className="tabular-nums">{money(icmsLiquido ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-1 font-semibold text-[var(--foreground)]">
                <span>= Imposto operacional</span>
                <span className="tabular-nums">{money(impostoOperacional)}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-3 border-t border-dashed border-[var(--border)] pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Margem operacional — o que sobra depois de tudo
              </p>
              <span className="shrink-0 tabular-nums font-medium">
                {money(margemOperacional)} (
                {formatFinancialPercent(margemPercent)})
              </span>
            </div>
            {showDetails ? (
              <div className="mt-1 space-y-1 font-mono text-[11px] text-[var(--muted-foreground)]">
                <div className="flex justify-between gap-3">
                  <span>Valor da venda</span>
                  <span className="tabular-nums">{money(t.receitaBruta)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>− Custo do produto</span>
                  <span className="tabular-nums">{money(cmvTotal)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>− Imposto operacional</span>
                  <span className="tabular-nums">
                    {money(impostoOperacional)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-1 font-semibold text-[var(--foreground)]">
                  <span>= Margem operacional</span>
                  <span className="tabular-nums">
                    {money(margemOperacional)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      </ShowDetailsContext.Provider>
    </Card>
  );
}
