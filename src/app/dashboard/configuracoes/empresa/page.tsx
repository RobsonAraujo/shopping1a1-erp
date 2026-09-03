import type { Metadata } from "next";
import { CompanyRegimeClient } from "@/components/configuracoes/CompanyRegimeClient";

export const metadata: Metadata = {
  title: "Empresa — Configurações",
};

export default function ConfiguracoesEmpresaPage() {
  return <CompanyRegimeClient />;
}
