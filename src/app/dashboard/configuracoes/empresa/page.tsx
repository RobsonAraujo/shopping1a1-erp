import type { Metadata } from "next";
import { CompanyRegimeClient } from "@/components/configuracoes/company-regime-client";

export const metadata: Metadata = {
  title: "Empresa — Configurações",
};

export default function ConfiguracoesEmpresaPage() {
  return <CompanyRegimeClient />;
}
