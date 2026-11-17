import { prisma } from "@/lib/db/db";
import type { Organization } from "@/generated/prisma";
import type { SignupAttribution } from "@/lib/marketing/attribution";

/** Dados de origem do cadastro, gravados só quando a organização nasce. */
export type SignupContext = {
  source?: SignupAttribution | null;
  offer?: string | null;
  trialEndsAt?: Date | null;
};

export type EnsureOrganizationResult = {
  organization: Organization;
  /** `true` no primeiro login deste seller: é o `sign_up` do funil. */
  created: boolean;
};

/**
 * Resolve a Organization vinculada a um seller ML, criando-a (com o dono e o
 * vínculo) no primeiro login. Só o callback OAuth chama esta função — em
 * todo outro lugar (`requireOrganization()`) a ausência de vínculo é tratada
 * como erro, nunca como gatilho de criação, para manter previsível quem cria
 * organizações.
 */
export async function ensureOrganizationForMlSeller(
  mlUserId: number,
  profile: { email?: string; nickname?: string },
  signup: SignupContext = {},
): Promise<EnsureOrganizationResult> {
  const existing = await prisma.organizationMlSeller.findUnique({
    where: { mlUserId },
    include: { organization: true },
  });
  if (existing) return { organization: existing.organization, created: false };

  return prisma.$transaction(async (tx) => {
    // Corrida entre duas requests do mesmo primeiro login: reconfirma dentro
    // da transação antes de criar, para não gerar 2 organizações pro mesmo seller.
    const raceCheck = await tx.organizationMlSeller.findUnique({
      where: { mlUserId },
      include: { organization: true },
    });
    if (raceCheck) return { organization: raceCheck.organization, created: false };

    const organization = await tx.organization.create({
      data: {
        name: profile.nickname || `Vendedor ${mlUserId}`,
        slug: `org-${mlUserId}`,
        status: "trialing",
        ...(signup.source ? { signupSource: signup.source } : {}),
        ...(signup.offer ? { signupOffer: signup.offer } : {}),
        ...(signup.trialEndsAt ? { trialEndsAt: signup.trialEndsAt } : {}),
      },
    });

    const owner = await tx.user.create({
      data: { email: profile.email || null, name: profile.nickname || null },
    });

    await tx.organizationMember.create({
      data: { organizationId: organization.id, userId: owner.id, role: "owner" },
    });

    await tx.organizationMlSeller.create({
      data: { organizationId: organization.id, mlUserId, isPrimary: true },
    });

    return { organization, created: true };
  });
}
