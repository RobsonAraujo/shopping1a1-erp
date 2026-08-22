import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FullShipmentsClient } from "@/components/envios-full/full-shipments-client";
import { Card, CardContent } from "@/components/ui/card";
import {
  listFullShipmentsForPeriod,
  listImportedBillingPeriods,
} from "@/lib/envios-full/full-shipment-data";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";

export const metadata: Metadata = {
  title: "Relatório de Envios",
};

export default async function EnviosFullPage() {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  let data: {
    year: number;
    month: number;
    shipments: Awaited<ReturnType<typeof listFullShipmentsForPeriod>>;
    importedPeriods: Awaited<ReturnType<typeof listImportedBillingPeriods>>;
  } | null = null;
  let errorMsg: string | null = null;

  try {
    const { year, month } = getZonedYearMonth();
    const [shipments, importedPeriods] = await Promise.all([
      listFullShipmentsForPeriod(orgContext.organization.id, year, month),
      listImportedBillingPeriods(orgContext.organization.id),
    ]);
    data = { year, month, shipments, importedPeriods };
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Erro ao carregar envios Full";
  }

  if (!data) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{errorMsg}</CardContent>
      </Card>
    );
  }

  return (
    <FullShipmentsClient
      initialShipments={data.shipments}
      initialYear={data.year}
      initialMonth={data.month}
      initialImportedPeriods={data.importedPeriods}
    />
  );
}
