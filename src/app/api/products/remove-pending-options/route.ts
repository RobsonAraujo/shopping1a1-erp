import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { loadListingGroups } from "@/lib/products/listing-groups";
import {
  OptionCadastroError,
  pendingOptionCadastros,
  removeOptionCadastro,
} from "@/lib/products/product-options";

/**
 * Remove de uma vez os cadastros de opção de venda ainda com custo pendente
 * (custo R$ 0, vindos do "Importar todos"): o produto continua cadastrado
 * no principal. Cadastro de opção com custo de verdade não entra aqui.
 */
export async function POST() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  try {
    const groups = await loadListingGroups(organizationId);
    const ids = pendingOptionCadastros(groups);
    let removed = 0;
    for (const mlItemId of ids) {
      try {
        await removeOptionCadastro(organizationId, mlItemId, groups);
        removed += 1;
      } catch (e) {
        if (!(e instanceof OptionCadastroError)) throw e;
      }
    }
    return NextResponse.json({ removed, total: ids.length });
  } catch (e) {
    logServerError("api/products/remove-pending-options POST", e);
    return NextResponse.json(apiErrorPayload(e, "product_option_remove_failed"), {
      status: 502,
    });
  }
}
