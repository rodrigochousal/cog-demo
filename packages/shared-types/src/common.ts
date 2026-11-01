/** ISO-8601 timestamp, e.g. `2026-01-31T12:00:00.000Z`. */
export type ISODateString = string;

/** ISO-4217 currency code. */
export type CurrencyCode = "USD" | "EUR" | "GBP";

/** Monetary values are always integers in minor units (e.g. cents) to avoid float drift. */
export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

/** Every service returns errors in this envelope. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE_VIOLATION"
  | "INTERNAL_ERROR";

export interface HealthResponse {
  service: string;
  status: "ok";
  uptimeSeconds: number;
  timestamp: ISODateString;
}

/** One field-level failure reported by request-body validation. */
export interface ValidationIssue {
  /** Location of the offending value, e.g. `["approvalsReceived", 1]`; `[]` for the body itself. */
  path: (string | number)[];
  /** `path` joined with dots (`approvalsReceived.1`), or `"(body)"` for the body itself. */
  field: string;
  /** Zod issue code, e.g. `invalid_type`, `too_small`, `invalid_format`, `custom`. */
  code: string;
  message: string;
}

/** HTTP 400 body sent by `validateBody` when a request body fails its schema. */
export interface ValidationErrorBody {
  error: "ValidationError";
  issues: ValidationIssue[];
}
