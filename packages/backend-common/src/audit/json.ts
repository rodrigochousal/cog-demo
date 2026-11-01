/** Internal JSON helpers for the audit module. */

export const REDACTED = "[REDACTED]";
export const CIRCULAR = "[Circular]";

/** Keys whose values never reach the audit stream (matched case-insensitively, ignoring `_`/`-`). */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  "password",
  "passcode",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "authorization",
  "cookie",
  "cardNumber",
  "pan",
  "cvv",
  "cvc",
  "ssn",
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Assigns without triggering setters, so keys like `__proto__` stay plain data. */
export function setKey(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * Deep-copies `value` into plain JSON data: Dates become ISO strings, bigints and non-finite
 * numbers become strings, `toJSON()` is honoured, functions/symbols/undefined are dropped and
 * cycles are replaced with `"[Circular]"`. The result never aliases the input.
 */
export function toJsonSafe(value: unknown, ancestors: WeakSet<object> = new WeakSet()): unknown {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "bigint":
      return value.toString();
    case "undefined":
    case "function":
    case "symbol":
      return undefined;
  }
  if (typeof value !== "object" || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (ancestors.has(value)) return CIRCULAR;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item: unknown) => toJsonSafe(item, ancestors) ?? null);
    if ("toJSON" in value && typeof value.toJSON === "function") {
      const json: unknown = value.toJSON();
      return toJsonSafe(json, ancestors);
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const safe = toJsonSafe(item, ancestors);
      if (safe !== undefined) setKey(out, key, safe);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

/** Deep equality over values produced by {@link toJsonSafe}. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item: unknown, i) => jsonEqual(item, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
  }
  return false;
}

const normaliseKey = (key: string) => key.replace(/[^a-z0-9]/gi, "").toLowerCase();

/** Builds a matcher for {@link redact}. */
export function createRedactionMatcher(keys: readonly string[]): (key: string) => boolean {
  const set = new Set(keys.map(normaliseKey));
  return (key) => set.has(normaliseKey(key));
}

/** Returns a copy of JSON-safe `value` with every sensitive key's value replaced by `"[REDACTED]"`. */
export function redact(value: unknown, isSensitive: (key: string) => boolean): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => redact(item, isSensitive));
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    setKey(out, key, isSensitive(key) ? REDACTED : redact(item, isSensitive));
  }
  return out;
}
