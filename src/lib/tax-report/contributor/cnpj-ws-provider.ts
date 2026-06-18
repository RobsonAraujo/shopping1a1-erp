import type {
  ClienteVerificacaoContribuinte,
  ContributorVerificationResult,
} from "@/lib/tax-report/contributor/types";

const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class CnpjWsContributorProvider implements ClienteVerificacaoContribuinte {
  constructor(private readonly apiKey: string) {}

  async verificarContribuinteIcms(
    cnpj: string,
  ): Promise<ContributorVerificationResult> {
    const digits = cnpj.replace(/\D/g, "");
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch(`https://www.cnpj.ws/cnpj/${digits}`, {
          headers: {
            "x_api_token": this.apiKey,
            Accept: "application/json",
          },
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timer);

        if (!res.ok) {
          throw new Error(`CNPJ.ws ${res.status}`);
        }

        const json = (await res.json()) as {
          estabelecimento?: {
            inscricoes_estaduais?: Array<{ ativo?: boolean; estado?: { sigla?: string } }>;
          };
        };

        const inscricoes = json.estabelecimento?.inscricoes_estaduais ?? [];
        const isContributor = inscricoes.some((i) => i.ativo === true);

        return {
          isContributor,
          provider: "cnpj_ws",
          fromCache: false,
        };
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await sleep(500 * 2 ** attempt);
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("CNPJ.ws verification failed");
  }
}
