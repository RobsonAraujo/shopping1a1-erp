/**
 * Dados da empresa usados nas páginas institucionais (/privacidade, /termos,
 * /sobre) e no rodapé.
 *
 * ⚠️ PREENCHER ANTES DE PUBLICAR: razão social, CNPJ e endereço estão como
 * placeholder. O Mercado Livre exige uma URL de política de privacidade válida
 * na revisão do aplicativo, e os textos de /privacidade e /termos precisam de
 * revisão jurídica antes de irem ao ar.
 */
export const LEGAL = {
  productName: "ERP 1a1",
  legalName: "[RAZÃO SOCIAL]",
  cnpj: "[CNPJ]",
  address: "[ENDEREÇO COMPLETO]",
  supportEmail: "contato.shop1a1@gmail.com",
  /** Data da última revisão dos textos legais; atualizar a cada alteração. */
  updatedAt: "22 de setembro de 2026",
} as const;

export function legalUpdatedLabel() {
  return `Última atualização: ${LEGAL.updatedAt}`;
}
