/**
 * Dados da empresa usados nas páginas institucionais (/privacidade, /termos,
 * /sobre) e no rodapé. Razão social, CNPJ e endereço conforme o cartão CNPJ
 * da Receita (matriz).
 */
export const LEGAL = {
  productName: "Maipo",
  legalName: "SHOPPING UM A UM LTDA",
  cnpj: "53.991.838/0001-50",
  address:
    "Av. Paulista, 1636, conj. 03, pavimento 1, salas 103 e 105, anexo 416, Bela Vista, São Paulo/SP, CEP 01310-200",
  supportEmail: "contato.shop1a1@gmail.com",
  /** Data da última revisão dos textos legais; atualizar a cada alteração. */
  updatedAt: "14 de novembro de 2026",
} as const;

export function legalUpdatedLabel() {
  return `Última atualização: ${LEGAL.updatedAt}`;
}
