import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { OptionCadastroError, removeOptionCadastro } from "@/lib/products/product-options";

type RouteContext = { params: Promise<{ mlItemId: string }> };

/**
 * Remove o cadastro duplicado de uma opção de venda: o produto continua
 * cadastrado no anúncio principal, que passa a ter kits, nivelamentos e
 * fornecedor que apontavam para a opção.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;
  const { mlItemId } = await context.params;

  try {
    const { principal } = await removeOptionCadastro(organizationId, mlItemId);
    return NextResponse.json({ ok: true, principal });
  } catch (e) {
    if (e instanceof OptionCadastroError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    logServerError("api/products/[mlItemId]/remove-option POST", e);
    return NextResponse.json(apiErrorPayload(e, "product_option_remove_failed"), {
      status: 502,
    });
  }
}
