import type { Metadata } from "next";
import { TaxConfigClient } from "@/components/configuracoes/tax-config-client";

export const metadata: Metadata = {
  title: "Tributário — Configurações",
};

export default function ConfiguracoesTributarioPage() {
  return <TaxConfigClient />;
}
