export type ContributorVerificationResult = {
  isContributor: boolean;
  provider: string;
  fromCache: boolean;
};

export interface ClienteVerificacaoContribuinte {
  verificarContribuinteIcms(cnpj: string): Promise<ContributorVerificationResult>;
}
