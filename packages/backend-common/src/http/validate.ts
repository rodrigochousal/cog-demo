import { HttpError } from "./errors.js";

/**
 * Structural interface satisfied by zod (v3/v4), valibot adapters, etc.
 * Keeps backend-common free of a hard dependency on any validation library.
 */
export interface SafeParser<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: unknown } };
}

export function parseOrThrow<T>(schema: SafeParser<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION_FAILED", "Request validation failed", result.error.issues);
  }
  return result.data;
}
