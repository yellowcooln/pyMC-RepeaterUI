interface WaitForServiceRecoveryOptions {
  endpoint?: string;
  initialDelayMs?: number;
  intervalMs?: number;
  timeoutMs?: number;
  stableResponsesRequired?: number;
  isReady?: (response: Response) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForServiceRecovery({
  endpoint = '/api/stats',
  initialDelayMs = 4000,
  intervalMs = 1000,
  timeoutMs = 60000,
  stableResponsesRequired = 3,
  isReady = (response) => response.ok,
}: WaitForServiceRecoveryOptions = {}): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let stableCount = 0;

  if (initialDelayMs > 0) {
    await sleep(initialDelayMs);
  }

  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (isReady(response)) {
        stableCount++;
        if (stableCount >= stableResponsesRequired) {
          return true;
        }
      } else {
        stableCount = 0;
      }
    } catch {
      stableCount = 0;
    }

    await sleep(intervalMs);
  }

  return false;
}
