import type { ApiErrorCode } from "@platform/shared-types";

/**
 * Raised by shared domain modules when an invariant is violated.
 * The HTTP error handler maps `code` to a status, so services can let these bubble.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: Extract<ApiErrorCode, "NOT_FOUND" | "CONFLICT" | "BUSINESS_RULE_VIOLATION">,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (entity: string, id: string) =>
  new DomainError("NOT_FOUND", `${entity} '${id}' was not found`);
