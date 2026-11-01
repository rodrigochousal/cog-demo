/** Inclusive range of simulated network round-trip time, in milliseconds. */
export interface LatencyRange {
  minMs: number;
  maxMs: number;
}

/** `false` disables simulated latency (tests, benchmarks). */
export type LatencySetting = LatencyRange | false;

export const DEFAULT_LATENCY: LatencyRange = { minMs: 50, maxMs: 150 };

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function randomLatencyMs({ minMs, maxMs }: LatencyRange): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

/**
 * Parses `PLATFORM_SIMULATED_LATENCY_MS`: `"50-150"` (range), `"80"` (fixed) or `"0"`/`"off"` (disabled).
 * Unset falls back to {@link DEFAULT_LATENCY}; anything else throws so typos fail at boot.
 */
export function parseLatencySetting(raw: string | undefined): LatencySetting {
  if (raw === undefined || raw.trim() === "") return DEFAULT_LATENCY;
  const value = raw.trim().toLowerCase();
  if (value === "0" || value === "off" || value === "false") return false;
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(value);
  const minMs = match ? Number(match[1]) : Number.NaN;
  const maxMs = match?.[2] === undefined ? minMs : Number(match[2]);
  if (!Number.isSafeInteger(minMs) || !Number.isSafeInteger(maxMs) || maxMs < minMs) {
    throw new Error(`PLATFORM_SIMULATED_LATENCY_MS must look like "50-150", "80" or "off", got '${raw}'`);
  }
  return { minMs, maxMs };
}

/**
 * Runs `operation` after a pseudo-random delay, emulating the round trip to a
 * remote database or vendor API so UIs exercise their loading states locally.
 */
export async function withSimulatedLatency<T>(operation: () => Promise<T>, latency: LatencySetting): Promise<T> {
  if (latency !== false) await delay(randomLatencyMs(latency));
  return operation();
}
