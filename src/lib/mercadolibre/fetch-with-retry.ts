export class MlApiFetchError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "MlApiFetchError";
    this.status = status;
    this.url = url;
  }
}

export function isRetryableMlStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const DEFAULT_BACKOFF_MS = [1000, 2000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options?: { maxAttempts?: number; backoffMs?: number[] },
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;

  let lastStatus = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    lastStatus = res.status;
    const canRetry =
      isRetryableMlStatus(res.status) && attempt < maxAttempts - 1;
    if (!canRetry) {
      throw new MlApiFetchError(
        `Mercado Livre API respondeu com status ${res.status}`,
        res.status,
        url,
      );
    }

    const delay = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 1000;
    await sleep(delay);
  }

  throw new MlApiFetchError(
    `Mercado Livre API respondeu com status ${lastStatus}`,
    lastStatus,
    url,
  );
}
