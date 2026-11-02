import type { ApiErrorCode, ValidationIssue } from "@platform/shared-types";
import type { z } from "zod";

/** Non-2xx response from the BFF (decoded from the shared `{ error: { code, message } }` envelope) or a network failure (`status` 0). */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode | "NETWORK_ERROR" | "UNKNOWN",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** A 2xx response whose JSON payload does not match the client data contract. */
export class SchemaMismatchError extends Error {
  readonly code = "SCHEMA_MISMATCH";
  readonly issues: ValidationIssue[];

  constructor(
    public readonly method: string,
    public readonly url: string,
    zodError: z.ZodError,
  ) {
    const issues = zodError.issues.map((issue) => {
      const path = issue.path.map((key) => (typeof key === "number" ? key : String(key)));
      return { path, field: path.length ? path.join(".") : "(body)", code: issue.code, message: issue.message };
    });
    const first = issues[0];
    super(
      `Response of ${method} ${url} does not match its contract: ${issues.length} issue(s)` +
        (first ? `, e.g. ${first.field}: ${first.message}` : ""),
    );
    this.name = "SchemaMismatchError";
    this.issues = issues;
  }
}

export type ApiClientError = ApiRequestError | SchemaMismatchError;

export const isApiClientError = (error: unknown): error is ApiClientError =>
  error instanceof ApiRequestError || error instanceof SchemaMismatchError;

/** Human-readable message for any error a query or mutation can raise. */
export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) return error.status ? `${error.status} ${error.code}: ${error.message}` : error.message;
  if (error instanceof SchemaMismatchError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
