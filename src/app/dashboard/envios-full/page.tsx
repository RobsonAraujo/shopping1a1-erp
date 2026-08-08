import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FullShipmentsClient } from "@/components/full-shipments-client";
import { Card, CardContent } from "@/components/ui/card";
import {
  listFullShipmentsForPeriod,
  listImportedBillingPeriods,
} from "@/lib/full-shipment-data";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";

export const metadata: Metadata = {
  title: "Relatório de Envios",
};

export default async function EnviosFullPage() {
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard/envios-full"));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  try {
    const { year, month } = getZonedYearMonth();
    const [shipments, importedPeriods] = await Promise.all([
      listFullShipmentsForPeriod(year, month),
      listImportedBillingPeriods(),
    ]);
    return (
      <FullShipmentsClient
        initialShipments={shipments}
        initialYear={year}
        initialMonth={month}
        initialImportedPeriods={importedPeriods}
      />
    );
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Erro ao carregar envios Full";
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{msg}</CardContent>
      </Card>
    );
  }
}
