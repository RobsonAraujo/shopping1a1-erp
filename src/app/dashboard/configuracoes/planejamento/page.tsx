import type { Metadata } from "next";
import { OperationalSettingsClient } from "@/components/configuracoes/operational-settings-client";

export const metadata: Metadata = {
  title: "Planejamento — Configurações",
};

export default function ConfiguracoesPlanejamentoPage() {
  return <OperationalSettingsClient />;
}
