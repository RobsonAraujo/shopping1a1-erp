import { prisma } from "@/lib/db/db";

export type OnboardingStep = {
  id: "connect" | "register-costs" | "first-dre";
  label: string;
  description: string;
  href: string;
  done: boolean;
};

export type OnboardingChecklistState = {
  steps: OnboardingStep[];
  allDone: boolean;
};

/**
 * Sinais só de leitura, sem novo campo/migration: "conectar" é implícito (só
 * chega aqui autenticado); os outros dois usam a presença de registros que só
 * existem por ação explícita do usuário (Product e DreMonthSnapshot não têm
 * criação automática/lazy no primeiro login — ver ensure-organization.ts).
 */
export async function getOnboardingChecklistState(
  organizationId: string,
): Promise<OnboardingChecklistState> {
  const [productCount, dreSnapshotCount] = await Promise.all([
    prisma.product.count({ where: { organizationId } }),
    prisma.dreMonthSnapshot.count({ where: { organizationId } }),
  ]);

  const steps: OnboardingStep[] = [
    {
      id: "connect",
      label: "Conectar Mercado Livre",
      description: "Sua loja já está conectada via OAuth oficial.",
      href: "/dashboard",
      done: true,
    },
    {
      id: "register-costs",
      label: "Cadastrar custo dos seus produtos",
      description: "Custo, ICMS e NCM por SKU — a base da margem e do DRE.",
      href: "/dashboard/produtos",
      done: productCount > 0,
    },
    {
      id: "first-dre",
      label: "Ver seu primeiro DRE",
      description: "Resultado do mês: receita, custos e o que sobra no fim.",
      href: "/dashboard/dre",
      done: dreSnapshotCount > 0,
    },
  ];

  return { steps, allDone: steps.every((step) => step.done) };
}
