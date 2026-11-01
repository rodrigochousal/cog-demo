import { createRedactionMatcher, DEFAULT_REDACT_KEYS, isRecord, jsonEqual, redact, setKey, toJsonSafe } from "./json.js";
import type { AuditDelta, AuditRecord } from "./types.js";

export interface DeltaOptions {
  /** Keys masked as `"[REDACTED]"` in the output. Defaults to {@link DEFAULT_REDACT_KEYS}. */
  redactKeys?: readonly string[];
}

/**
 * Takes a JSON-safe, detached copy of a record's state. `null`/`undefined` mean "no record";
 * non-object values are wrapped as `{ value }` so a delta is always keyed.
 */
export function snapshotRecord(state: unknown): AuditRecord | null {
  if (state === null || state === undefined) return null;
  const safe = toJsonSafe(state);
  return isRecord(safe) ? safe : { value: safe ?? null };
}

/**
 * Keeps only the keys whose values differ. Nested objects are diffed recursively so structure
 * is preserved; arrays and scalars are compared whole. A key present on only one side was
 * added (only in `newValue`) or removed (only in `oldValue`).
 */
function diffRecords(before: AuditRecord, after: AuditRecord): [AuditRecord, AuditRecord] {
  const oldValue: AuditRecord = {};
  const newValue: AuditRecord = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const inBefore = Object.hasOwn(before, key);
    const inAfter = Object.hasOwn(after, key);
    if (inBefore && !inAfter) {
      setKey(oldValue, key, before[key]);
      continue;
    }
    if (!inBefore && inAfter) {
      setKey(newValue, key, after[key]);
      continue;
    }
    const a = before[key];
    const b = after[key];
    if (isRecord(a) && isRecord(b)) {
      const [nestedOld, nestedNew] = diffRecords(a, b);
      if (Object.keys(nestedOld).length > 0 || Object.keys(nestedNew).length > 0) {
        setKey(oldValue, key, nestedOld);
        setKey(newValue, key, nestedNew);
      }
    } else if (!jsonEqual(a, b)) {
      setKey(oldValue, key, a);
      setKey(newValue, key, b);
    }
  }
  return [oldValue, newValue];
}

/**
 * Pure: computes the audit delta between two states of one record without mutating or
 * aliasing either input.
 *
 * - create (`oldObj` null/undefined): `{ oldValue: null, newValue: <full record> }`
 * - delete (`newObj` null/undefined): `{ oldValue: <full record>, newValue: null }`
 * - update: both sides hold only the changed keys (`{}` and `{}` when nothing changed)
 *
 * Diffing happens before redaction, so a changed secret still shows up, as
 * `"[REDACTED]"` on both sides.
 */
export function computeDelta(oldObj: unknown, newObj: unknown, options: DeltaOptions = {}): AuditDelta {
  const before = snapshotRecord(oldObj);
  const after = snapshotRecord(newObj);
  const [oldValue, newValue] = before && after ? diffRecords(before, after) : [before, after];
  const isSensitive = createRedactionMatcher(options.redactKeys ?? DEFAULT_REDACT_KEYS);
  return {
    oldValue: oldValue && (redact(oldValue, isSensitive) as AuditRecord),
    newValue: newValue && (redact(newValue, isSensitive) as AuditRecord),
  };
}
