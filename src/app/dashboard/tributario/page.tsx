import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organizations/context";
import { loadTaxCompanyConfig } from "@/lib/tax-report/tax-config-data";

/**
 * Redirecionador server-side: o menu "Tributário" sempre aponta pra cá, e
 * esta rota manda pra `/dashboard/simples-nacional` ou
 * `/dashboard/relatorio-tributario` conforme o regime tributário real da
 * empresa — sem o usuário precisar saber qual das duas telas usar. Acesso
 * direto pelas URLs finais continua funcionando e continua travado por
 * regime em cada página (client-side), como já era antes desta rota existir.
 */
export default async function TributarioRedirectPage() {
  const orgContext = await getOrganizationContext();

  if (orgContext.status === "active") {
    const config = await loadTaxCompanyConfig(orgContext.organization.id);
    if (config.taxRegime === "SIMPLES") {
      redirect("/dashboard/simples-nacional");
    }
  }

  redirect("/dashboard/relatorio-tributario");
}
