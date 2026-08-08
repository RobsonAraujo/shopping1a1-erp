import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { DreClient } from "@/components/dre-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DRE_DISCLAIMER_PAGE } from "@/lib/dre-disclaimer";

export const metadata: Metadata = {
  title: "DRE",
};

export default function DrePage() {
  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[96rem] space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              DRE
            </h1>
            <Badge variant="warning">Indisponível</Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Demonstrativo de resultado por mês — faturamento e custos do Mercado
            Livre, custos de produto e impostos do ERP, custos fixos cadastrados
            e campanhas ADS.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex gap-3 pt-6 text-sm text-amber-950">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-amber-600"
              aria-hidden
            />
            <p>{DRE_DISCLAIMER_PAGE}</p>
          </CardContent>
        </Card>

        <DreClient />
      </div>
    </div>
  );
}
