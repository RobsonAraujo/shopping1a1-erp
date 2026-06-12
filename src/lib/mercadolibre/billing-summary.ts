import { getMercadoLibreConfig } from "./config";

export type MlBillingSummary = {
  saleFee: number;
  sellerShipping: number;
  cancelledSales: number;
  partialReturns: number;
  source: "billing";
};

type BillingCharge = {
  label?: string;
  amount?: number;
  type?: string;
  groupId?: string;
};

type BillingSummaryResponse = {
  charges?: BillingCharge[];
  bonuses?: BillingCharge[];
};

function normalizeLabel(label: string | undefined): string {
  return (label ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function matchAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function chargeAmount(entry: BillingCharge): number {
  const amount = Number(entry.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

/** Mapeia charges/bonuses do summary ML para linhas do DRE (valores negativos = custo). */
export function mapBillingSummaryToDreLines(
  data: BillingSummaryResponse,
): Omit<MlBillingSummary, "source"> {
  let saleFee = 0;
  let sellerShipping = 0;
  let cancelledSales = 0;
  let partialReturns = 0;

  const allEntries = [...(data.charges ?? []), ...(data.bonuses ?? [])];

  for (const entry of allEntries) {
    const label = normalizeLabel(entry.label);
    const type = (entry.type ?? "").toUpperCase();
    const amount = chargeAmount(entry);

    if (
      matchAny(label, [
        /cancel/,
        /cancelad/,
        /anulad/,
      ]) ||
      type === "CXC"
    ) {
      cancelledSales -= Math.abs(amount);
      continue;
    }

    if (
      matchAny(label, [
        /devol/,
        /reembol/,
        /partial/,
        /parcial/,
      ])
    ) {
      partialReturns += amount;
      continue;
    }

    if (
      matchAny(label, [
        /frete/,
        /envio/,
        /shipping/,
        /logistic/,
      ]) ||
      type === "SHP"
    ) {
      sellerShipping -= Math.abs(amount);
      continue;
    }

    if (
      matchAny(label, [
        /tarifa/,
        /comis/,
        /venda/,
        /sale/,
        /fee/,
      ]) ||
      type === "CXD" ||
      type === "COM"
    ) {
      saleFee -= Math.abs(amount);
      continue;
    }
  }

  return {
    saleFee,
    sellerShipping,
    cancelledSales,
    partialReturns,
  };
}

function billingPeriodKey(year: number, month: number): string {
  const m = String(month).padStart(2, "0");
  return `${year}-${m}-01`;
}

export async function fetchMlBillingSummaryForMonth(
  accessToken: string,
  year: number,
  month: number,
): Promise<MlBillingSummary | null> {
  const { apiBase } = getMercadoLibreConfig();
  const key = billingPeriodKey(year, month);
  const u = new URL(
    `${apiBase}/billing/integration/periods/key/${key}/summary/details`,
  );
  u.searchParams.set("group", "ML");
  u.searchParams.set("document_type", "BILL");

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as BillingSummaryResponse;
  const mapped = mapBillingSummaryToDreLines(data);
  return { ...mapped, source: "billing" };
}
