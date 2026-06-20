/**
 * Probe inbound Full por inbound_id no billing e operations/search.
 *
 * Usage:
 *   npx tsx scripts/debug-full-inbound.ts 2026 6 69719031
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getMercadoLibreConfig } from "../src/lib/mercadolibre/config";
import { billingPeriodKey } from "../src/lib/mercadolibre/billing-shared";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";

type FullBillingDetailRow = {
  charge_info?: {
    detail_amount?: number;
    detail_id?: number;
    creation_date_time?: string;
    transaction_detail?: string;
    detail_type?: string;
    detail_sub_type?: string;
  };
  fulfillment_info?: {
    type?: string;
    inbound_id?: number | string;
    quantity?: number;
    sku?: string;
    item_id?: string;
    inventory_id?: string;
  };
};

async function resolveMlUserId(): Promise<number> {
  const fromEnv = process.env.CRON_ML_USER_ID?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const row = await prisma.mlSellerCredentials.findFirst({
    select: { mlUserId: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!row) throw new Error("No ml_seller_credentials row found.");
  return row.mlUserId;
}

async function fetchAllFullDetails(
  token: string,
  key: string,
): Promise<FullBillingDetailRow[]> {
  const { apiBase } = getMercadoLibreConfig();
  const allRows: FullBillingDetailRow[] = [];
  const limit = 1000;

  for (const documentType of ["BILL", "CREDIT_NOTE"] as const) {
    let fromId = 0;
    for (;;) {
      const u = new URL(
        `${apiBase}/billing/integration/periods/key/${key}/group/ML/full/details`,
      );
      u.searchParams.set("document_type", documentType);
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("from_id", String(fromId));

      const res = await fetch(u.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        console.log(`full/details ${documentType} status=${res.status}`);
        break;
      }

      const data = (await res.json()) as {
        results?: FullBillingDetailRow[];
        last_id?: number;
      };
      const batch = data.results ?? [];
      if (batch.length === 0) break;
      allRows.push(...batch);

      const lastId = data.last_id;
      if (
        typeof lastId !== "number" ||
        !Number.isFinite(lastId) ||
        batch.length < limit
      ) {
        break;
      }
      fromId = lastId;
    }
  }

  return allRows;
}

type FulfillmentOperation = {
  id?: number;
  inventory_id?: string;
  date_created?: string;
  type?: string;
  detail?: { available_quantity?: number };
  external_references?: Array<{ type?: string; value?: string }>;
};

async function fetchInboundReceptions(
  token: string,
  sellerId: number,
  inventoryId: string,
  dateFrom: string,
  dateTo: string,
): Promise<FulfillmentOperation[]> {
  const { apiBase } = getMercadoLibreConfig();
  const results: FulfillmentOperation[] = [];
  let scroll: string | null = null;

  for (;;) {
    const u = new URL(`${apiBase}/stock/fulfillment/operations/search`);
    u.searchParams.set("seller_id", String(sellerId));
    u.searchParams.set("inventory_id", inventoryId);
    u.searchParams.set("date_from", dateFrom);
    u.searchParams.set("date_to", dateTo);
    u.searchParams.set("type", "INBOUND_RECEPTION");
    u.searchParams.set("limit", "1000");
    if (scroll) u.searchParams.set("scroll", scroll);

    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.log(
        `operations/search inventory=${inventoryId} status=${res.status}`,
      );
      break;
    }

    const data = (await res.json()) as {
      results?: FulfillmentOperation[];
      paging?: { scroll?: string | null };
    };
    results.push(...(data.results ?? []));
    scroll = data.paging?.scroll ?? null;
    if (!scroll) break;
  }

  return results;
}

function formatDateYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const month = Number(process.argv[3] ?? new Date().getMonth() + 1);
  const inboundTarget = process.argv[4] ?? "69719031";

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(
      "Usage: npx tsx scripts/debug-full-inbound.ts <year> <month> [inboundId]",
    );
  }

  const mlUserId = await resolveMlUserId();
  const token = await resolveSellerAccessToken(mlUserId);
  if (!token) throw new Error(`No token for seller ${mlUserId}`);

  const key = billingPeriodKey(year, month);
  console.log(
    `\n=== Probe inbound ${inboundTarget} key=${key} seller=${mlUserId} ===\n`,
  );

  const rows = await fetchAllFullDetails(token, key);
  console.log(`Total full/details rows: ${rows.length}`);

  const inboundRows = rows.filter((row) => {
    const id = row.fulfillment_info?.inbound_id;
    return id != null && String(id) === String(inboundTarget);
  });

  console.log(`Rows matching inbound_id=${inboundTarget}: ${inboundRows.length}`);

  if (inboundRows.length === 0) {
    const collectRows = rows.filter(
      (r) =>
        r.fulfillment_info?.type === "INBOUND_COLLECT" ||
        r.charge_info?.detail_sub_type === "CFCBI",
    );
    const inboundIds = new Set(
      collectRows
        .map((r) => r.fulfillment_info?.inbound_id)
        .filter((id) => id != null)
        .map(String),
    );
    console.log(
      `INBOUND_COLLECT rows: ${collectRows.length}, distinct inbound_ids: ${inboundIds.size}`,
    );
    console.log("Sample inbound_ids:", [...inboundIds].slice(0, 20));
    return;
  }

  let totalCost = 0;
  let totalQty = 0;
  const products = new Set<string>();
  const inventoryIds = new Set<string>();
  const dates: string[] = [];

  for (const row of inboundRows) {
    const amount = Number(row.charge_info?.detail_amount ?? 0);
    const qty = Number(row.fulfillment_info?.quantity ?? 0);
    totalCost += amount;
    totalQty += qty;
    const productKey =
      row.fulfillment_info?.sku ?? row.fulfillment_info?.item_id ?? "";
    if (productKey) products.add(productKey);
    if (row.fulfillment_info?.inventory_id) {
      inventoryIds.add(row.fulfillment_info.inventory_id);
    }
    if (row.charge_info?.creation_date_time) {
      dates.push(row.charge_info.creation_date_time);
    }
    console.log(
      JSON.stringify(
        {
          detail_id: row.charge_info?.detail_id,
          amount,
          qty,
          sku: row.fulfillment_info?.sku,
          item_id: row.fulfillment_info?.item_id,
          inventory_id: row.fulfillment_info?.inventory_id,
          creation_date_time: row.charge_info?.creation_date_time,
        },
        null,
        2,
      ),
    );
  }

  console.log("\n--- Billing aggregate ---");
  console.log({
    inboundId: inboundTarget,
    productCount: products.size,
    totalUnits: totalQty,
    totalCost: Math.round(totalCost * 100) / 100,
    earliestDate: dates.sort()[0] ?? null,
    inventoryIds: [...inventoryIds],
  });

  const center = new Date(Date.UTC(year, month - 1, 19));
  const dateFrom = formatDateYmd(
    new Date(center.getTime() - 30 * 24 * 60 * 60 * 1000),
  );
  const dateTo = formatDateYmd(
    new Date(center.getTime() + 30 * 24 * 60 * 60 * 1000),
  );

  console.log(
    `\n--- operations/search INBOUND_RECEPTION ${dateFrom}..${dateTo} ---`,
  );

  let opsUnits = 0;
  const opsDates: string[] = [];

  for (const inventoryId of inventoryIds) {
    const ops = await fetchInboundReceptions(
      token,
      mlUserId,
      inventoryId,
      dateFrom,
      dateTo,
    );
    const matched = ops.filter((op) =>
      op.external_references?.some(
        (ref) =>
          ref.type === "inbound_id" &&
          String(ref.value) === String(inboundTarget),
      ),
    );
    for (const op of matched) {
      const qty = Number(op.detail?.available_quantity ?? 0);
      opsUnits += qty;
      if (op.date_created) opsDates.push(op.date_created);
      console.log(
        JSON.stringify({
          inventory_id: inventoryId,
          operation_id: op.id,
          date_created: op.date_created,
          available_quantity: qty,
        }),
      );
    }
  }

  console.log("\n--- Operations aggregate ---");
  console.log({
    inboundId: inboundTarget,
    totalUnitsFromOps: opsUnits,
    earliestReception: opsDates.sort()[0] ?? null,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
