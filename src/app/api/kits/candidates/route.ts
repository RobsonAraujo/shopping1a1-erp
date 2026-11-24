import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/db";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { isKitItem } from "@/lib/mercadolibre/item-sku";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { loadListingGroups } from "@/lib/products/listing-groups";

export type KitCandidate = {
  mlItemId: string;
  title: string;
  imageUrl: string | null;
};

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  try {
    const items = await fetchOperationalListings(token, userId, organizationId);
    const kitItems = items.filter((item) => isKitItem(item));

    const [registered, groups] = await Promise.all([
      prisma.kit.findMany({ where: { organizationId }, select: { mlItemId: true } }),
      loadListingGroups(organizationId, { extraItems: kitItems }),
    ]);
    const registeredSet = new Set(registered.map((row) => row.mlItemId));

    // Opções de venda de um kit (Clássico, Premium… do mesmo kit) usam a
    // composição cadastrada no principal: um candidato por kit físico.
    const seen = new Set<string>();
    const candidates: KitCandidate[] = kitItems
      .filter((item) => {
        const principal = groups.principalOf(item.id);
        if (registeredSet.has(item.id) || registeredSet.has(principal)) return false;
        if (seen.has(principal)) return false;
        seen.add(principal);
        return true;
      })
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
