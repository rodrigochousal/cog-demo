/** ISO-8601 timestamp, e.g. `2026-01-31T12:00:00.000Z`. */
export type ISODateString = string;

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

/** `error.details` of the `VALIDATION_FAILED` (HTTP 400) envelope sent by `validateBody`. */
export interface ValidationErrorDetails {
  issues: ValidationIssue[];
}
