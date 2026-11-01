import { DomainError, notFound } from "../errors.js";

/**
 * The storage driver behind a connector failed (unreadable/corrupt file, lock
 * timeout, …). Deliberately not a DomainError: the HTTP error handler logs it
 * and answers 500 without leaking file paths to the browser.
 */
export class ConnectorError extends Error {
  constructor(
    public readonly connector: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`[${connector}] ${message}`, options);
    this.name = "ConnectorError";
  }
}

export const invalidInput = (message: string, details?: unknown) =>
  new DomainError("BUSINESS_RULE_VIOLATION", message, details);

/** Rejects blank identifiers with a descriptive error before any lookup happens. */
export function requireId(entity: string, id: unknown): string {
  if (typeof id !== "string" || id.trim() === "") throw invalidInput(`${entity} id is required`);
  return id;
}

/** Returns the index of the record with `id`, or throws a NOT_FOUND DomainError. */
export function indexOrThrow<T>(records: readonly T[], entity: string, id: string, idOf: (record: T) => string): number {
  const index = records.findIndex((record) => idOf(record) === id);
  if (index === -1) throw notFound(entity, id);
  return index;
}
