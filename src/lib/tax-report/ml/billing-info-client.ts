import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import {
  resolveUfDestino,
  ufFromStateCode,
  ufFromStateId,
  ufFromStateName,
} from "@/lib/tax-report/brazilian-ufs";
import type { BuyerDocumentType } from "@/lib/tax-report/types";

type MlBillingAdditionalInfo = {
  type?: string;
  value?: string;
};

type MlBillingState =
  | string
  | {
      name?: string;
      id?: string;
      code?: string;
    };

export type OrderBillingInfoResponse = {
  buyer?: {
    billing_info?: {
      identification?: {
        type?: string;
        number?: string;
      };
      address?: {
        state?: MlBillingState;
        state_name?: string;
      };
      additional_info?: MlBillingAdditionalInfo[];
      taxes?: {
        taxpayer_type?: { description?: string; id?: string };
      };
    };
  };
};

function parseMlError(text: string): string {
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message ?? json.error ?? text;
  } catch {
    return text;
  }
}

function readAdditionalStateName(
  additionalInfo: MlBillingAdditionalInfo[] | undefined,
): string | null {
  if (!additionalInfo?.length) return null;
  const entry = additionalInfo.find(
    (item) => item.type?.toUpperCase() === "STATE_NAME",
  );
  return entry?.value?.trim() || null;
}

function readMlBillingStateFields(billing: OrderBillingInfoResponse | null): {
  stateName: string | null;
  stateId: string | null;
  stateCode: string | null;
} {
  const address = billing?.buyer?.billing_info?.address;
  const state = address?.state;

  if (typeof state === "string") {
    return {
      stateName: state.trim() || null,
      stateId: null,
      stateCode: null,
    };
  }

  return {
    stateName:
      state?.name?.trim() ||
      address?.state_name?.trim() ||
      readAdditionalStateName(billing?.buyer?.billing_info?.additional_info) ||
      null,
    stateId: state?.id?.trim() || null,
    stateCode: state?.code?.trim() || null,
  };
}

export async function fetchOrderBillingInfo(
  accessToken: string,
  orderId: string | number,
): Promise<OrderBillingInfoResponse | null> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetch(`${apiBase}/orders/${orderId}/billing_info`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-version": "2",
    },
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `orders/${orderId}/billing_info failed: ${res.status} ${parseMlError(text)}`,
    );
  }

  return res.json() as Promise<OrderBillingInfoResponse>;
}

export function parseBuyerDocumentType(type: string | undefined): BuyerDocumentType {
  const normalized = type?.trim().toUpperCase();
  if (normalized === "CPF") return "CPF";
  if (normalized === "CNPJ") return "CNPJ";
  return "UNKNOWN";
}

export function parseTaxpayerTypeFromMl(
  description: string | undefined,
): boolean | null {
  if (!description) return null;
  const lower = description.toLowerCase();
  if (lower.includes("contribuinte") && !lower.includes("não") && !lower.includes("nao")) {
    return true;
  }
  if (lower.includes("não contribuinte") || lower.includes("nao contribuinte")) {
    return false;
  }
  return null;
}

export function parseUfFromBilling(
  billing: OrderBillingInfoResponse | null,
): string | null {
  const { stateName, stateId, stateCode } = readMlBillingStateFields(billing);

  const fromName = ufFromStateName(stateName);
  if (fromName) return fromName;

  const fromIdOrCode =
    ufFromStateId(stateId) ??
    ufFromStateCode(stateCode) ??
    ufFromStateName(stateId) ??
    ufFromStateName(stateCode);
  if (fromIdOrCode) return fromIdOrCode;

  return resolveUfDestino(stateId ?? stateCode ?? stateName);
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
