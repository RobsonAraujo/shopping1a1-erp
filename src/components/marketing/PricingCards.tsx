import { CheckCircle2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OAuthCta } from "@/components/marketing/OauthCta";

const BETA_FEATURES = [
  "Lucratividade por anúncio",
  "DRE mensal",
  "Apuração de Lucro Real por SKU",
  "Simples Nacional — RBT12 e DAS",
  "Estoque e reposição",
  "Kanban de compras e Full",
];

const PLACEHOLDER_FEATURES = ["Recurso a definir", "Recurso a definir", "Recurso a definir"];

function LockedCard({ name }: { name: string }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--muted-foreground)]">{name}</p>
        <Badge variant="muted">Em breve</Badge>
      </div>

      <div className="pointer-events-none mt-4 select-none blur-[3px]">
        <p className="text-3xl font-bold tabular-nums text-[var(--foreground)]">
          R$ ––,––
          <span className="text-sm font-normal text-[var(--muted-foreground)]"> /mês</span>
        </p>
        <ul className="mt-6 space-y-2.5">
          {PLACEHOLDER_FEATURES.map((label, index) => (
            <li key={index} className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="absolute inset-0 flex items-center justify-center bg-[var(--card)]/55">
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] shadow-sm">
          <Lock className="size-3.5" aria-hidden />
          Preço a definir
        </span>
      </div>

      <Button type="button" variant="outline" disabled className="mt-6 w-full">
        Em breve
      </Button>
    </div>
  );
}

export function PricingCards({
  isLoggedIn,
  dashboardHref,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <div
        className={cn(
          "flex flex-col rounded-2xl border-2 border-[var(--primary)] bg-[var(--card)] p-6 shadow-[0_1px_2px_rgba(15,18,31,0.04),0_12px_32px_-16px_rgba(27,45,111,0.25)]",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--primary)]">Beta</p>
          <Badge className="border-emerald-200/80 bg-emerald-50 text-emerald-900">
            Ativo agora
          </Badge>
        </div>
        <p className="mt-4 text-3xl font-bold text-[var(--foreground)]">
          Grátis
          <span className="text-sm font-normal text-[var(--muted-foreground)]">
            {" "}
            enquanto durar o beta
          </span>
        </p>
        <ul className="mt-6 flex-1 space-y-2.5">
          {BETA_FEATURES.map((label) => (
            <li key={label} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <OAuthCta isLoggedIn={isLoggedIn} dashboardHref={dashboardHref} className="w-full" />
        </div>
      </div>

      <LockedCard name="Pro" />
      <LockedCard name="Avançado" />
    </div>
  );
}
