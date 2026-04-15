import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  fetchAllUserItemIds,
  fetchItemPriceToWin,
  fetchItemsByIdsBatched,
} from "@/lib/mercadolibre/api";
import {
  deriveStatusFromPriceToWin,
  extractPriceToWin,
} from "@/lib/catalog-competition";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

type Body = {
  itemIds?: unknown;
  source?: unknown;
};

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // optional body; ignore parse errors
  }

  let itemIds: string[] = [];
  if (Array.isArray(body.itemIds)) {
    itemIds = body.itemIds.filter((x): x is string => typeof x === "string");
  } else {
    itemIds = await fetchAllUserItemIds(token, userId, {
      status: "active",
      catalog_listing: true,
    });
  }
  itemIds = [...new Set(itemIds)];
  if (itemIds.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  try {
    const items = await fetchItemsByIdsBatched(token, itemIds, 20);
    const itemById = Object.fromEntries(items.map((item) => [item.id, item]));

    let processed = 0;
    for (const itemId of itemIds) {
      try {
        const raw = await fetchItemPriceToWin(token, itemId);
        const payload = raw as Record<string, unknown>;
        const rawResponse = JSON.parse(JSON.stringify(payload));
        const status = deriveStatusFromPriceToWin(payload);
        const price = extractPriceToWin(payload);
        const item = itemById[itemId];
        const sku = item ? getItemSku(item) : null;
        const imageUrl = item ? bestItemImageUrl(item) : null;

        await prisma.$transaction(async (tx) => {
          await tx.listing.upsert({
            where: { mlItemId: itemId },
            create: {
              mlItemId: itemId,
              titleSnapshot: item?.title ?? null,
              skuSnapshot: sku,
              imageUrlSnapshot: imageUrl ?? null,
              catalogListing: item?.catalog_listing ?? true,
              activeOnMl: item ? item.status === "active" || item.status === "paused" : true,
              lastSyncedAt: new Date(),
            },
            update: {
              titleSnapshot: item?.title ?? undefined,
              skuSnapshot: sku ?? undefined,
              imageUrlSnapshot: imageUrl ?? undefined,
              catalogListing: item?.catalog_listing ?? true,
              activeOnMl: item
                ? item.status === "active" || item.status === "paused"
                : undefined,
              lastSyncedAt: new Date(),
            },
          });

          await tx.catalogCompetitionSnapshot.create({
            data: {
              mlItemId: itemId,
              status,
              source: body.source === "webhook" ? "webhook" : "manual_poll",
              priceToWin: price,
              rawResponse,
            },
          });
        });
        processed += 1;
      } catch (e) {
        logServerError(`api/ml/catalog-competition/snapshot item=${itemId}`, e);
      }
    }

    return NextResponse.json({ ok: true, processed, total: itemIds.length });
  } catch (e) {
    logServerError("api/ml/catalog-competition/snapshot", e);
    return NextResponse.json(apiErrorPayload(e, "catalog_snapshot_failed"), {
      status: 502,
    });
  }
}

