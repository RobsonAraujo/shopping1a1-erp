import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FullShipmentsClient } from "@/components/envios-full/FullShipmentsClient";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  listFullShipmentsForPeriod,
  listImportedBillingPeriods,
} from "@/lib/envios-full/full-shipment-data";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

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
    errorMsg = publicPageLoadMessage(
      "dashboard/envios-full",
      e,
      "Não foi possível carregar os envios Full agora. Tente de novo em instantes.",
    );
  }

  if (!data) {
    return (
      <UserFeedback title="Não foi possível carregar os envios">
        {errorMsg}
      </UserFeedback>
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
