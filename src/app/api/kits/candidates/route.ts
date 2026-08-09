import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { isKitItem } from "@/lib/mercadolibre/item-sku";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";

export type KitCandidate = {
  mlItemId: string;
  title: string;
  imageUrl: string | null;
};

export async function GET() {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

  try {
    const items = await fetchOperationalListings(token, userId);
    const kitItems = items.filter((item) => isKitItem(item));

    const registered = await prisma.kit.findMany({
      where: { mlItemId: { in: kitItems.map((item) => item.id) } },
      select: { mlItemId: true },
    });
    const registeredSet = new Set(registered.map((row) => row.mlItemId));

    const candidates: KitCandidate[] = kitItems
      .filter((item) => !registeredSet.has(item.id))
      .map((item) => ({
        mlItemId: item.id,
        title: item.title,
        imageUrl: bestItemImageUrl(item) ?? null,
      }));

    return NextResponse.json({ candidates });
  } catch (e) {
    logServerError("api/kits/candidates GET", e);
    return NextResponse.json(apiErrorPayload(e, "kit_candidates_load_failed"), {
      status: 502,
    });
  }
}
