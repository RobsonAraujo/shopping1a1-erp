export class StubContributorProvider implements ClienteVerificacaoContribuinte {
  async verificarContribuinteIcms(
    _cnpj: string,
  ): Promise<ContributorVerificationResult> {
    return {
      isContributor: false,
      provider: "stub",
      fromCache: false,
    };
  }
}
