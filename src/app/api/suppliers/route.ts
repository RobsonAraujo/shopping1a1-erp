import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

const supplierWriteSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do fornecedor"),
});

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const onlyActive = request.nextUrl.searchParams.get("active") === "true";

  try {
    const suppliers = await prisma.supplier.findMany({
      where: { organizationId, ...(onlyActive ? { active: true } : {}) },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        active: true,
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json({
      suppliers: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        active: s.active,
        productCount: s._count.products,
      })),
    });
  } catch (e) {
    logServerError("api/suppliers GET", e);
    return NextResponse.json(apiErrorPayload(e, "suppliers_load_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, supplierWriteSchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const supplier = await prisma.supplier.create({
      data: { organizationId, name: parsedBody.data.name },
      select: { id: true, name: true, active: true },
    });
    return NextResponse.json({ supplier: { ...supplier, productCount: 0 } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um fornecedor com esse nome" },
        { status: 409 },
      );
    }
    logServerError("api/suppliers POST", e);
    return NextResponse.json(apiErrorPayload(e, "supplier_create_failed"), {
      status: 502,
    });
  }
}
