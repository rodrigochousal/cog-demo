import type { ValidationErrorBody, ValidationIssue } from "@platform/shared-types";
import type { Request, RequestHandler } from "express";
import { z } from "zod";
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

/** Any Zod object schema, whatever its shape or unknown-key mode (strip / strict / loose). */
export type AnyZodObject = z.ZodObject<z.ZodRawShape, z.core.$ZodObjectConfig>;

/** Methods whose body `validateBody` checks; anything else passes straight through. */
export const VALIDATED_BODY_METHODS = ["POST", "PUT", "PATCH"] as const;

const isValidatedMethod = (method: string) => (VALIDATED_BODY_METHODS as readonly string[]).includes(method);

const toPathSegment = (key: PropertyKey): string | number => (typeof key === "number" ? key : String(key));

/** Flattens Zod issues into the client-facing, field-level `ValidationIssue` list. */
export function toValidationIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => {
    const path = issue.path.map(toPathSegment);
    return { path, field: path.length ? path.join(".") : "(body)", code: issue.code, message: issue.message };
  });
}

export const validationErrorBody = (error: z.ZodError): ValidationErrorBody => ({
  error: "ValidationError",
  issues: toValidationIssues(error.issues),
});

/**
 * Express middleware factory for the strict data-contract layer. On POST/PUT/PATCH it parses
 * `req.body` with `schema` and replaces `req.body` with the parsed output (whitespace trimmed,
 * defaults applied, unknown keys stripped). Other methods pass through untouched.
 *
 * An invalid or missing body short-circuits with HTTP 400 and
 * `{ "error": "ValidationError", "issues": [...] }`; downstream handlers never run.
 * The parsed type flows into the next handlers on the same route:
 *
 *   router.post("/v1/refunds", validateBody(refundTransactionSchema), (req, res) => {
 *     req.body.currency; // string, already upper-cased
 *   });
 */
export function validateBody<S extends AnyZodObject>(
  schema: S,
): RequestHandler<Request["params"], unknown, z.output<S>> {
  return (req, res, next) => {
    if (!isValidatedMethod(req.method)) {
      next();
      return;
    }
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(validationErrorBody(result.error));
      return;
    }
    req.body = result.data;
    next();
  };
}
