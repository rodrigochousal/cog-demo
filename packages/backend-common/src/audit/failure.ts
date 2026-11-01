import { STATUS_CODES } from "node:http";
import { DomainError } from "../errors.js";
import { HttpError } from "../http/errors.js";
import { isRecord, toJsonSafe } from "./json.js";
import type { AuditFailure } from "./types.js";

const withDetails = (code: string, message: string, details: unknown): AuditFailure => {
  const safe = toJsonSafe(details);
  return safe === undefined ? { code, message } : { code, message, details: safe };
};

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
 * Derives an audit failure from an error response body — the shared
 * `{ error: { code, message, details } }` envelope or `validateBody`'s
 * `{ error: "ValidationError", issues }` — falling back to the HTTP status.
 */
export function failureFromResponse(status: number, body: unknown): AuditFailure {
  const fallbackMessage = STATUS_CODES[status] ?? "Request failed";
  if (isRecord(body) && body.error === "ValidationError" && Array.isArray(body.issues)) {
    return withDetails("VALIDATION_FAILED", "Request validation failed", body.issues);
  }
  if (isRecord(body) && isRecord(body.error) && typeof body.error.code === "string") {
    const { code, message, details } = body.error;
    return withDetails(code, typeof message === "string" ? message : fallbackMessage, details);
  }
  return { code: `HTTP_${status}`, message: fallbackMessage };
}
