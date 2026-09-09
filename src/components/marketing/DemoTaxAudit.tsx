"use client";

import { TaxReportCalculationPanel } from "@/components/relatorio-tributario/TaxReportCalculationPanel";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

/**
 * Uma venda fictícia (SKU, pedido e valores inventados) processada pela
 * mesma "Memória de cálculo" usada de verdade no relatório tributário
 * (src/components/relatorio-tributario/TaxReportCalculationPanel.tsx) — não
 * é uma versão simplificada, é o componente real com dados de demonstração.
 */
const DEMO_ROW: DetalhamentoTributario = {
  transacao: {
    transactionKey: "demo-1",
    orderId: "2000012345678",
    orderDate: "2026-08-14T00:00:00.000Z",
    sku: "FONE-BT-01",
    itemId: "MLB4504162607",
    quantidade: 2,
    receitaBruta: 259.8,
    ufDestino: "MG",
    tipoDocumento: "CPF",
    documento: null,
    contribuinteIcms: null,
    contribuinteSource: null,
    dadosFiscaisIndisponiveis: false,
    custoAquisicaoUnitario: 42,
    unitCostNf: 42,
    purchaseIcmsPercent: 12,
    hasIcmsSt: false,
    purchaseCostWithSt: null,
    saleIcmsPercent: 18,
    extraCostsUnitario: 1.5,
    mercadoriaImportada: false,
    isMonophasic: false,
    saleFee: 33.77,
    freightCost: 18.9,
    ipiPercent: 0,
  },
  pisCofins: {
    baseDebito: 213.03,
    baseCredito: 87,
    pisDebito: 3.51,
    cofinsDebito: 16.19,
    debitoTotal: 19.7,
    pisCredito: 1.44,
    cofinsCredito: 6.61,
    creditoTotal: 8.05,
    liquido: 11.65,
    icmsExcluidoDaBase: 46.77,
    excludedIcmsFromBase: true,
    pisRatePercent: 1.65,
    cofinsRatePercent: 7.6,
  },
  icmsDifal: {
    ufOrigem: "SP",
    ufDestino: "MG",
    aliquotaInterestadual: 0.12,
    aliquotaInternaTotal: 0.18,
    icmsInterestadual: 31.18,
    difal: 15.59,
    icmsTotal: 46.77,
    isContribuinte: false,
    isOperacaoInterna: false,
    icmsStNaCompra: false,
  },
  icmsCreditoCompra: {
    baseUnitaria: 84,
    aliquotaPercent: 12,
    creditoTotal: 10.08,
    stRecuperavelTotal: 0,
  },
  creditoOutrasDespesas: {
    meliFee: { base: 33.77, aliquotaPercent: 9.25, credito: 3.12 },
    ads: {
      base: 12.5,
      aliquotaPercent: 9.25,
      credito: 1.16,
      gastoAdsMesItem: 480,
      receitaMesItem: 9950,
    },
    frete: { base: 18.9, aliquotaPercent: 9.25, credito: 1.75 },
    custosFixos: {
      base: 6.2,
      aliquotaPercent: 9.25,
      credito: 0.57,
      custosFixosMesTotal: 3200,
      receitaMesTotal: 133800,
    },
    creditoTotal: 6.6,
  },
  cbsIbs: null,
  impostoTotal: 41.74,
  margemOperacionalEstimada: 131.06,
  incluidoNaApuracao: true,
  memoriaCalculo: [],
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--foreground)]">
        {value}
      </p>
    </div>
  );
}

export function DemoTaxAudit() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Vendas no mês" value="86" />
        <StatTile label="Receita do SKU" value="R$ 22.343,00" />
        <StatTile label="Imposto operacional médio" value="16,1%" />
        <StatTile label="Margem operacional média" value="50,4%" />
      </div>
      <TaxReportCalculationPanel row={DEMO_ROW} onClose={() => {}} />
    </div>
  );
}
