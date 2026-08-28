import type { AnexoFaixa } from "@/lib/simples-nacional/types";

/**
 * Tabela do Anexo I do Simples Nacional (Comércio) — LC 123/2006, art. 18,
 * §1º-A, atualizada pela LC 155/2016 (vigente desde 01/01/2018), percentuais
 * de repartição por tributo conforme Anexo I / Resolução CGSN 140/2018.
 *
 * Dado público de referência nacional — não depende da organização, por isso
 * é constante no código em vez de tabela no banco. Só vale para o Anexo I
 * (comércio/revenda), único suportado nesta v1 — ver README deste módulo.
 * Confira contra a fonte oficial (gov.br/simples-nacional) antes de usar em
 * decisão fiscal real; esta página é apoio gerencial, não substitui o PGDAS-D.
 */
export const ANEXO_I_FAIXAS: readonly AnexoFaixa[] = [
  {
    faixa: 1,
    rbt12Min: 0,
    rbt12Max: 180_000,
    aliquotaNominalPercent: 4.0,
    parcelaDeduzir: 0,
    composicaoPercentual: {
      irpj: 5.5,
      csll: 3.5,
      cofins: 12.74,
      pis: 2.76,
      cpp: 41.5,
      icms: 34.0,
    },
  },
  {
    faixa: 2,
    rbt12Min: 180_000.01,
    rbt12Max: 360_000,
    aliquotaNominalPercent: 7.3,
    parcelaDeduzir: 5_940,
    composicaoPercentual: {
      irpj: 5.5,
      csll: 3.5,
      cofins: 12.74,
      pis: 2.76,
      cpp: 41.5,
      icms: 34.0,
    },
  },
  {
    faixa: 3,
    rbt12Min: 360_000.01,
    rbt12Max: 720_000,
    aliquotaNominalPercent: 9.5,
    parcelaDeduzir: 13_860,
    composicaoPercentual: {
      irpj: 5.5,
      csll: 3.5,
      cofins: 12.74,
      pis: 2.76,
      cpp: 42.0,
      icms: 33.5,
    },
  },
  {
    faixa: 4,
    rbt12Min: 720_000.01,
    rbt12Max: 1_800_000,
    aliquotaNominalPercent: 10.7,
    parcelaDeduzir: 22_500,
    composicaoPercentual: {
      irpj: 5.5,
      csll: 3.5,
      cofins: 12.74,
      pis: 2.76,
      cpp: 42.0,
      icms: 33.5,
    },
  },
  {
    faixa: 5,
    rbt12Min: 1_800_000.01,
    rbt12Max: 3_600_000,
    aliquotaNominalPercent: 14.3,
    parcelaDeduzir: 87_300,
    composicaoPercentual: {
      irpj: 8.5,
      csll: 7.5,
      cofins: 20.55,
      pis: 4.6,
      cpp: 23.25,
      icms: 35.5,
    },
  },
  {
    faixa: 6,
    rbt12Min: 3_600_000.01,
    rbt12Max: 4_800_000,
    aliquotaNominalPercent: 19.0,
    parcelaDeduzir: 378_000,
    composicaoPercentual: {
      irpj: 8.5,
      csll: 7.5,
      cofins: 20.55,
      pis: 4.6,
      cpp: 23.25,
      icms: 35.5,
    },
  },
] as const;

/** Sublimite de recolhimento do ICMS/ISS por fora do Simples (LC 123/2006, art. 19). */
export const SIMPLES_SUBLIMITE_RBT12 = 3_600_000;

/** Teto de faturamento do Simples Nacional (LC 123/2006, art. 3º, §2º). */
export const SIMPLES_TETO_RBT12 = 4_800_000;
