import { STATUS_CODES } from "node:http";
import { DomainError } from "../errors.js";
import { HttpError } from "../http/errors.js";
import { isRecord, toJsonSafe } from "./json.js";
import type { AuditFailure } from "./types.js";

const withDetails = (code: string, message: string, details: unknown): AuditFailure => {
  const safe = toJsonSafe(details);
  return safe === undefined ? { code, message } : { code, message, details: safe };
};

const toCode = (text: string) =>
  text
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase() || "FAILED";

/** Normalises a thrown value (HttpError, DomainError, zod-style error, Error, ...) into an audit failure. */
export function toAuditFailure(error: unknown): AuditFailure {
  if (error instanceof HttpError || error instanceof DomainError) {
    return withDetails(error.code, error.message, error.details);
  }
  if (isRecord(error) && Array.isArray(error.issues)) {
    return withDetails("VALIDATION_FAILED", "Request validation failed", error.issues);
  }
  if (error instanceof Error) return { code: "INTERNAL_ERROR", message: error.message };
  if (typeof error === "string") return { code: "FAILED", message: error };
  return { code: "INTERNAL_ERROR", message: "Unknown error" };
}

/**
 * Derives an audit failure from an error response body. Understands the shared
 * `{ error: { code, message, details } }` envelope and the RBAC `{ error, reason }` body,
 * falling back to the HTTP status.
 */
export function failureFromResponse(status: number, body: unknown): AuditFailure {
  const fallbackMessage = STATUS_CODES[status] ?? "Request failed";
  if (isRecord(body)) {
    const { error } = body;
    if (isRecord(error) && typeof error.code === "string") {
      const message = typeof error.message === "string" ? error.message : fallbackMessage;
      return withDetails(error.code, message, error.details);
    }
    if (typeof error === "string") {
      return { code: toCode(error), message: typeof body.reason === "string" ? body.reason : error };
    }
  }
  return { code: `HTTP_${status}`, message: fallbackMessage };
}
