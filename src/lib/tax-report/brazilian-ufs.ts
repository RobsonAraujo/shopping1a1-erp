export const BRAZILIAN_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export type BrazilianUf = (typeof BRAZILIAN_UFS)[number];

const BRAZILIAN_UF_SET = new Set<string>(BRAZILIAN_UFS);

/** Catálogo oficial + variações comuns no billing_info do Mercado Livre (MLB). */
export const BRAZILIAN_STATE_CATALOG: ReadonlyArray<{
  uf: BrazilianUf;
  names: readonly string[];
  ibgeCode: string;
}> = [
  { uf: "AC", ibgeCode: "12", names: ["Acre", "AC"] },
  { uf: "AL", ibgeCode: "27", names: ["Alagoas", "AL"] },
  { uf: "AP", ibgeCode: "16", names: ["Amapá", "Amapa", "AP"] },
  { uf: "AM", ibgeCode: "13", names: ["Amazonas", "AM"] },
  { uf: "BA", ibgeCode: "29", names: ["Bahia", "BA"] },
  { uf: "CE", ibgeCode: "23", names: ["Ceará", "Ceara", "CE"] },
  {
    uf: "DF",
    ibgeCode: "53",
    names: ["Distrito Federal", "Brasília", "Brasilia", "DF"],
  },
  {
    uf: "ES",
    ibgeCode: "32",
    names: ["Espírito Santo", "Espirito Santo", "ES"],
  },
  { uf: "GO", ibgeCode: "52", names: ["Goiás", "Goias", "GO"] },
  { uf: "MA", ibgeCode: "21", names: ["Maranhão", "Maranhao", "MA"] },
  { uf: "MT", ibgeCode: "51", names: ["Mato Grosso", "MT"] },
  { uf: "MS", ibgeCode: "50", names: ["Mato Grosso do Sul", "MS"] },
  { uf: "MG", ibgeCode: "31", names: ["Minas Gerais", "MG"] },
  { uf: "PA", ibgeCode: "15", names: ["Pará", "Para", "PA"] },
  { uf: "PB", ibgeCode: "25", names: ["Paraíba", "Paraiba", "PB"] },
  { uf: "PR", ibgeCode: "41", names: ["Paraná", "Parana", "PR"] },
  { uf: "PE", ibgeCode: "26", names: ["Pernambuco", "PE"] },
  { uf: "PI", ibgeCode: "22", names: ["Piauí", "Piau", "PI"] },
  { uf: "RJ", ibgeCode: "33", names: ["Rio de Janeiro", "RJ"] },
  { uf: "RN", ibgeCode: "24", names: ["Rio Grande do Norte", "RN"] },
  { uf: "RS", ibgeCode: "43", names: ["Rio Grande do Sul", "RS"] },
  { uf: "RO", ibgeCode: "11", names: ["Rondônia", "Rondonia", "RO"] },
  { uf: "RR", ibgeCode: "14", names: ["Roraima", "RR"] },
  { uf: "SC", ibgeCode: "42", names: ["Santa Catarina", "SC"] },
  { uf: "SP", ibgeCode: "35", names: ["São Paulo", "Sao Paulo", "SP"] },
  { uf: "SE", ibgeCode: "28", names: ["Sergipe", "SE"] },
  { uf: "TO", ibgeCode: "17", names: ["Tocantins", "TO"] },
];

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function buildNameLookup(): Record<string, BrazilianUf> {
  const lookup: Record<string, BrazilianUf> = {};
  for (const entry of BRAZILIAN_STATE_CATALOG) {
    for (const name of entry.names) {
      lookup[stripAccents(name.trim().toUpperCase())] = entry.uf;
    }
  }
  return lookup;
}

function buildIbgeLookup(): Record<string, BrazilianUf> {
  const lookup: Record<string, BrazilianUf> = {};
  for (const entry of BRAZILIAN_STATE_CATALOG) {
    lookup[entry.ibgeCode] = entry.uf;
  }
  return lookup;
}

/** Truncamento de 2 chars (UTF-16) que o ML às vezes manda em state.id — só entradas únicas. */
function buildMlTruncatedIdLookup(): Record<string, BrazilianUf> {
  const groups = new Map<string, Set<BrazilianUf>>();

  for (const entry of BRAZILIAN_STATE_CATALOG) {
    for (const name of entry.names) {
      const truncated = name.slice(0, 2);
      const keys = new Set([truncated, truncated.toUpperCase()]);
      for (const key of keys) {
        if (normalizeUf(key)) continue;
        const bucket = groups.get(key) ?? new Set<BrazilianUf>();
        bucket.add(entry.uf);
        groups.set(key, bucket);
      }
    }
  }

  const lookup: Record<string, BrazilianUf> = {};
  for (const [key, ufs] of groups) {
    if (ufs.size === 1) {
      lookup[key] = [...ufs][0];
    }
  }
  return lookup;
}

const UF_BY_STATE_NAME = buildNameLookup();
const UF_BY_IBGE_CODE = buildIbgeLookup();
const ML_TRUNCATED_STATE_ID = buildMlTruncatedIdLookup();

export function normalizeUf(uf: string | null | undefined): string | null {
  if (!uf) return null;
  const normalized = uf.trim().toUpperCase();
  if (normalized.length !== 2) return null;
  return BRAZILIAN_UF_SET.has(normalized) ? normalized : null;
}

export function ufFromStateName(stateName: string | null | undefined): string | null {
  if (!stateName) return null;
  const key = stripAccents(stateName.trim().toUpperCase());
  return UF_BY_STATE_NAME[key] ?? null;
}

export function ufFromStateCode(stateCode: string | null | undefined): string | null {
  if (!stateCode) return null;
  const digits = stateCode.trim().replace(/\D/g, "");
  if (!digits) return null;
  return UF_BY_IBGE_CODE[digits.padStart(2, "0").slice(-2)] ?? null;
}

export function ufFromTruncatedMlStateId(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return (
    ML_TRUNCATED_STATE_ID[trimmed] ??
    ML_TRUNCATED_STATE_ID[trimmed.toUpperCase()] ??
    null
  );
}

export function ufFromStateId(stateId: string | null | undefined): string | null {
  if (!stateId) return null;
  const trimmed = stateId.trim();
  const normalized = trimmed.toUpperCase();

  const direct = normalizeUf(normalized);
  if (direct) return direct;

  const brMatch = normalized.match(/(?:^BR-)?([A-Z]{2})$/i);
  if (brMatch) return normalizeUf(brMatch[1]);

  const fromName = ufFromStateName(trimmed);
  if (fromName) return fromName;

  const fromCode = ufFromStateCode(trimmed);
  if (fromCode) return fromCode;

  return ufFromTruncatedMlStateId(trimmed);
}

export function resolveUfDestino(raw: string | null | undefined): string | null {
  const direct = normalizeUf(raw);
  if (direct) return direct;

  if (!raw) return null;

  return (
    ufFromStateName(raw) ??
    ufFromStateCode(raw) ??
    ufFromStateId(raw) ??
    ufFromTruncatedMlStateId(raw)
  );
}

export const BRAZILIAN_UF_OPTIONS = BRAZILIAN_UFS.map((uf) => ({
  value: uf,
  label: uf,
}));

export function getMlTruncatedStateIdLookup(): Readonly<Record<string, BrazilianUf>> {
  return ML_TRUNCATED_STATE_ID;
}
