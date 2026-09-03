import type { Metadata } from "next";
import { OperationalSettingsClient } from "@/components/configuracoes/OperationalSettingsClient";

export const metadata: Metadata = {
  title: "Planejamento — Configurações",
};

export default function ConfiguracoesPlanejamentoPage() {
  return <OperationalSettingsClient />;
}
