import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { isKitItem } from "@/lib/mercadolibre/item-sku";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

export type KitCandidate = {
  mlItemId: string;
  title: string;
  imageUrl: string | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
