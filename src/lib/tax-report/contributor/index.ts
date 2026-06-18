import { isCnpjWsEnabled } from "@/lib/tax-report/config";
import { CnpjWsContributorProvider } from "@/lib/tax-report/contributor/cnpj-ws-provider";
import { withContributorCache } from "@/lib/tax-report/contributor/cache";
import { StubContributorProvider } from "@/lib/tax-report/contributor/stub-provider";
import type { ClienteVerificacaoContribuinte } from "@/lib/tax-report/contributor/types";

export function createContributorProvider(): ClienteVerificacaoContribuinte {
  const base = isCnpjWsEnabled()
    ? new CnpjWsContributorProvider(process.env.CNPJ_WS_API_KEY!)
    : new StubContributorProvider();

  return withContributorCache(base);
}

export async function resolveContributorStatus(input: {
  cnpj: string | null;
  mlTaxpayerType: boolean | null;
  provider: ClienteVerificacaoContribuinte;
}): Promise<{
  contribuinteIcms: boolean;
  source: "ml_taxpayer_type" | "external_api" | "stub_fallback";
}> {
  if (input.mlTaxpayerType !== null) {
    return {
      contribuinteIcms: input.mlTaxpayerType,
      source: "ml_taxpayer_type",
    };
  }

  if (!input.cnpj) {
    const stub = await input.provider.verificarContribuinteIcms("00000000000000");
    return {
      contribuinteIcms: stub.isContributor,
      source: "stub_fallback",
    };
  }

  try {
    const result = await input.provider.verificarContribuinteIcms(input.cnpj);
    return {
      contribuinteIcms: result.isContributor,
      source: result.provider === "stub" ? "stub_fallback" : "external_api",
    };
  } catch {
    const stub = await input.provider.verificarContribuinteIcms(input.cnpj);
    return {
      contribuinteIcms: stub.isContributor,
      source: "stub_fallback",
    };
  }
}
