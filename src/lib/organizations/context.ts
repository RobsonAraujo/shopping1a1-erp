import { cookies } from "next/headers";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";
import { prisma } from "@/lib/db/db";
import type { Organization } from "@/generated/prisma";

export type OrganizationContext =
  | { status: "unauthenticated" }
  | { status: "no_organization" }
  | { status: "blocked"; organization: Organization }
  | { status: "active"; organization: Organization; mlUserId: number };

/**
 * Variante de `requireOrganization()` (src/lib/api-auth.ts) para Server
 * Components — não devolve NextResponse, só o resultado, pra quem chama
 * decidir o que renderizar (ex.: `dashboard/layout.tsx`).
 */
export async function getOrganizationContext(): Promise<OrganizationContext> {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return { status: "unauthenticated" };

  const link = await prisma.organizationMlSeller.findUnique({
    where: { mlUserId: userId },
    include: { organization: true },
  });
  if (!link) return { status: "no_organization" };

  if (link.organization.status !== "trialing" && link.organization.status !== "active") {
    return { status: "blocked", organization: link.organization };
  }

  return { status: "active", organization: link.organization, mlUserId: userId };
}
