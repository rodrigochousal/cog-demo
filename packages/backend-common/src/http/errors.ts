import type { ApiErrorBody, ApiErrorCode } from "@platform/shared-types";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { DomainError } from "../errors.js";
import type { Logger } from "./logger.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Use from services for screen-specific business rule failures. */
export const businessRuleViolation = (message: string, details?: unknown) =>
  new HttpError(422, "BUSINESS_RULE_VIOLATION", message, details);

const DOMAIN_STATUS: Record<DomainError["code"], number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE_VIOLATION: 422,
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    let status = 500;
    let body: ApiErrorBody = { error: { code: "INTERNAL_ERROR", message: "Internal server error" } };

    if (err instanceof HttpError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (err instanceof DomainError) {
      status = DOMAIN_STATUS[err.code];
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (err instanceof SyntaxError && "body" in err) {
      status = 400;
      body = { error: { code: "BAD_REQUEST", message: "Malformed JSON body" } };
    } else {
      logger.error("Unhandled error", { error: err instanceof Error ? err.stack : String(err) });
    }
    res.status(status).json(body);
  };
}
