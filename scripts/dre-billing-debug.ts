/**
 * Diagnóstico da API de faturamento ML para um mês do DRE.
 *
 * Usage:
 *   npm run dre:billing-debug -- 2026 1
 *   npm run dre:billing-debug -- 2026 1 123456789
 *
 * Requires DATABASE_URL, ENCRYPTION_KEY and ML credentials in DB.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  aggregateMlBillingDetails,
  fetchAllMlBillingDetails,
} from "../src/lib/mercadolibre/billing-details";
import { billingPeriodKey } from "../src/lib/mercadolibre/billing-shared";
import {
  extractBillingSummaryEntries,
  fetchBillingSummaryRawForDebug,
  mapBillingSummaryToDreLines,
} from "../src/lib/mercadolibre/billing-summary";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";
import { getMercadoLibreConfig } from "../src/lib/mercadolibre/config";

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function printSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function resolveMlUserId(explicit?: string): Promise<number> {
  if (explicit) {
    const n = Number(explicit);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`Invalid seller id: ${explicit}`);
    }
    return n;
  }

  const fromEnv = process.env.CRON_ML_USER_ID?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const row = await prisma.mlSellerCredentials.findFirst({
    select: { mlUserId: true },
  });
  if (!row) {
    throw new Error("No ml_seller_credentials row found.");
  }
  return row.mlUserId;
}

async function fetchMonthlyPeriods(accessToken: string) {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/billing/integration/monthly/periods`);
  u.searchParams.set("group", "ML");
  u.searchParams.set("document_type", "BILL");
  u.searchParams.set("limit", "12");

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  console.log(`monthly/periods status: ${res.status}`);
  if (!res.ok) {
    console.log(await res.text());
    return;
  }

  const data = (await res.json()) as {
    results?: Array<{
      key?: string;
      period?: { date_from?: string; date_to?: string };
      amount?: number;
    }>;
  };

  for (const row of data.results ?? []) {
    console.log(
      `- key=${row.key} ${row.period?.date_from} → ${row.period?.date_to} amount=${row.amount}`,
    );
  }
}

async function main() {
  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const month = Number(process.argv[3] ?? 1);
  const sellerArg = process.argv[4];

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Usage: npm run dre:billing-debug -- <year> <month> [mlUserId]");
  }

  const mlUserId = await resolveMlUserId(sellerArg);
  const token = await resolveSellerAccessToken(mlUserId);
  if (!token) {
    throw new Error(`Could not resolve access token for seller ${mlUserId}`);
  }

  const key = billingPeriodKey(year, month);
  printSection(`Períodos ML (seller ${mlUserId})`);
  await fetchMonthlyPeriods(token);

  printSection(`Summary BILL key=${key}`);
  const bill = await fetchBillingSummaryRawForDebug(token, key, "BILL");
  console.log(`HTTP ${bill.status} ok=${bill.ok}`);
  if (bill.data?.period) {
    console.log(
      `period: ${bill.data.period.date_from} → ${bill.data.period.date_to}`,
    );
  }
  if (bill.data?.payment_collected) {
    console.log("payment_collected:", bill.data.payment_collected);
  }
  const billEntries = bill.data ? extractBillingSummaryEntries(bill.data) : null;
  if (billEntries) {
    console.log("\ncharges:");
    for (const c of billEntries.charges) {
      console.log(`  [${c.type}] ${c.label}: ${c.amount}`);
    }
    console.log("bonuses:");
    for (const b of billEntries.bonuses) {
      console.log(`  [${b.type}] ${b.label}: ${b.amount}`);
    }
  }

  printSection(`Summary CREDIT_NOTE key=${key}`);
  const credit = await fetchBillingSummaryRawForDebug(token, key, "CREDIT_NOTE");
  console.log(`HTTP ${credit.status} ok=${credit.ok}`);
  const creditEntries = credit.data
    ? extractBillingSummaryEntries(credit.data)
    : null;
  if (creditEntries) {
    console.log("\ncharges:");
    for (const c of creditEntries.charges) {
      console.log(`  [${c.type}] ${c.label}: ${c.amount}`);
    }
    console.log("bonuses:");
    for (const b of creditEntries.bonuses) {
      console.log(`  [${b.type}] ${b.label}: ${b.amount}`);
    }
  }

  const mergedSummary = mapBillingSummaryToDreLines({
    period: bill.data?.period ?? credit.data?.period,
    payment_collected:
      bill.data?.payment_collected ?? credit.data?.payment_collected,
    bill_includes: {
      charges: [
        ...(billEntries?.charges ?? []),
        ...(creditEntries?.charges ?? []),
      ],
      bonuses: [
        ...(billEntries?.bonuses ?? []),
        ...(creditEntries?.bonuses ?? []),
      ],
    },
  });

  printSection("Details /group/ML/details");
  const detailEntries = await fetchAllMlBillingDetails(token, key);
  console.log(`detail rows: ${detailEntries.length}`);
  const detailsAgg =
    detailEntries.length > 0
      ? aggregateMlBillingDetails(detailEntries)
      : null;

  if (detailsAgg) {
    console.log("by sub_type:");
    for (const [subType, amount] of Object.entries(detailsAgg.bySubType).sort(
      (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
    )) {
      console.log(`  ${subType}: ${money(amount)}`);
    }
    console.log("\ntop labels:");
    for (const [label, amount] of Object.entries(detailsAgg.byLabel)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 20)) {
      console.log(`  ${label}: ${money(amount)}`);
    }
    if (detailsAgg.unmappedCharges !== 0) {
      console.log(`\nunmapped charges: ${money(detailsAgg.unmappedCharges)}`);
    }
  }

  printSection("Totais DRE (summary vs details)");
  const rows: Array<[string, number, number | null]> = [
    ["Faturamento ML", mergedSummary.revenueMl ?? 0, detailsAgg?.revenueFromOrders ?? null],
    ["Tarifa de venda", mergedSummary.saleFee, detailsAgg?.saleFeeMl ?? null],
    ["Frete vendedor", mergedSummary.sellerShipping, detailsAgg?.sellerShippingMl ?? null],
    ["Vendas canceladas", mergedSummary.cancelledSales, detailsAgg?.cancelledSalesMl ?? null],
    ["Devolução parcial", mergedSummary.partialReturns, detailsAgg?.partialReturnsMl ?? null],
    ["Campanhas ADS", mergedSummary.adsCost, detailsAgg?.adsCost ?? null],
    ["Minha Página", mergedSummary.minhaPagina, detailsAgg?.minhaPaginaMl ?? null],
    ["Comissão Afiliados", mergedSummary.affiliateFee, detailsAgg?.affiliateFeeMl ?? null],
    ["Full - Envios", mergedSummary.fullShipping, null],
    ["Full - Armazenamento", mergedSummary.fullStorage, null],
    ["Full - Inconformidades", mergedSummary.fullNonCompliance, null],
  ];

  console.log("Linha                     | Summary            | Details");
  console.log("--------------------------|--------------------|--------------------");
  for (const [label, summaryVal, detailsVal] of rows) {
    console.log(
      `${label.padEnd(25)} | ${money(summaryVal).padStart(18)} | ${money(detailsVal).padStart(18)}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
