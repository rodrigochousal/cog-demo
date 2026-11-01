import { z } from "zod";

/**
 * Reusable field schemas for the API contracts. Text fields trim surrounding whitespace before
 * any length or format check, so `"  "` counts as empty and stored values never carry padding.
 */

const MAX_ID_LENGTH = 128;

/** Opaque record identifier: a UUID or any other URL-safe id (`[A-Za-z0-9_-]`). */
export const recordIdSchema = z
  .string()
  .trim()
  .min(1, { error: "Must not be empty", abort: true })
  .max(MAX_ID_LENGTH, `Must be at most ${MAX_ID_LENGTH} characters`)
  .regex(/^[A-Za-z0-9_-]+$/, "Must contain only letters, digits, '-' or '_'");

/** Required, trimmed, non-empty text with an upper bound. */
export const requiredText = (max: number) =>
  z.string().trim().min(1, { error: "Must not be empty", abort: true }).max(max, `Must be at most ${max} characters`);

/** Optional free text: trimmed, may be empty, defaults to `""` when omitted. */
export const optionalText = (max: number) =>
  z.string().trim().max(max, `Must be at most ${max} characters`).default("");

/** ISO-8601 timestamp with a `Z` or `±hh:mm` offset (e.g. `2026-01-31T12:00:00.000Z`). */
export const isoDateTimeSchema = z
  .string()
  .trim()
  .pipe(z.iso.datetime({ offset: true, error: "Must be an ISO-8601 date-time, e.g. 2026-01-31T12:00:00Z" }));

/** Absolute `http(s)` URL; other schemes (`javascript:`, `data:`, `file:` ...) are rejected. */
export const httpUrlSchema = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https?$/, hostname: z.regexes.hostname, error: "Must be an absolute http(s) URL" }));

/** ISO-4217 alphabetic currency code. Case-insensitive on input, upper-cased on output (`usd` → `USD`). */
export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Must be a 3-letter ISO-4217 currency code, e.g. USD");

/** Array whose items must be distinct; each duplicate is reported at its own index. */
export const uniqueArray = <T extends z.ZodType>(item: T, label: string) =>
  z.array(item).superRefine((values, ctx) => {
    const seen = new Set<unknown>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        ctx.addIssue({ code: "custom", path: [index], message: `Duplicate ${label} '${String(value)}'` });
      }
      seen.add(value);
    });
  });
