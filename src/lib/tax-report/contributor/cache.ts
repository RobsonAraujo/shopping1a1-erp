import { prisma } from "@/lib/db";
import { getContributorCacheTtlMs } from "@/lib/tax-report/config";
import type {
  ClienteVerificacaoContribuinte,
  ContributorVerificationResult,
} from "@/lib/tax-report/contributor/types";

export async function getCachedContributorStatus(
  cnpj: string,
): Promise<ContributorVerificationResult | null> {
  const digits = cnpj.replace(/\D/g, "");
  const row = await prisma.taxpayerVerificationCache.findUnique({
    where: { cnpj: digits },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return {
    isContributor: row.isContributor,
    provider: row.provider,
    fromCache: true,
  };
}

export async function setCachedContributorStatus(
  cnpj: string,
  result: ContributorVerificationResult,
): Promise<void> {
  const digits = cnpj.replace(/\D/g, "");
  const expiresAt = new Date(Date.now() + getContributorCacheTtlMs());
  await prisma.taxpayerVerificationCache.upsert({
    where: { cnpj: digits },
    create: {
      cnpj: digits,
      isContributor: result.isContributor,
      provider: result.provider,
      expiresAt,
    },
    update: {
      isContributor: result.isContributor,
      provider: result.provider,
      expiresAt,
    },
  });
}

export function withContributorCache(
  provider: ClienteVerificacaoContribuinte,
): ClienteVerificacaoContribuinte {
  return {
    async verificarContribuinteIcms(cnpj: string) {
      const cached = await getCachedContributorStatus(cnpj);
      if (cached) return cached;

      const result = await provider.verificarContribuinteIcms(cnpj);
      await setCachedContributorStatus(cnpj, result);
      return result;
    },
  };
}
