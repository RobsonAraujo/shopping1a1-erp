import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Organization } from "@/generated/prisma";

const STATUS_LABEL: Record<Organization["status"], string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
};

/**
 * Renderizada no lugar das páginas do dashboard quando a organização não
 * está `trialing`/`active` — nenhuma delas chega a montar, então nenhuma
 * dispara query de negócio ou chamada ao Mercado Livre.
 */
export function AccountBlockedNotice({
  organization,
}: {
  organization: Organization;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--muted)]">
        <Lock className="size-6 text-[var(--muted-foreground)]" aria-hidden />
      </div>
      <Card className="w-full text-left">
        <CardHeader>
          <CardTitle>Acesso suspenso</CardTitle>
          <CardDescription>
            A assinatura de <strong>{organization.name}</strong> está com
            status &ldquo;{STATUS_LABEL[organization.status]}&rdquo;. Entre em
            contato para reativar o acesso aos dados e relatórios do ERP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">
            Seus dados continuam salvos — nada é apagado enquanto a
            assinatura está suspensa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
