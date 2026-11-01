import { refundTransactionSchema, type RefundTransaction } from "@platform/shared-types";
import { Router } from "express";
import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { auditAction, requirePermission, validateBody } from "../src/index.js";

describe("validateBody typing", () => {
  it("types req.body downstream as the schema output", () => {
    const router = Router();
    router.post("/v1/refunds", validateBody(refundTransactionSchema), (req) => {
      expectTypeOf(req.body).toEqualTypeOf<RefundTransaction>();
    });
  });

  it("keeps the body type when chained after other platform middleware", () => {
    const router = Router();
    router.put(
      "/v1/refunds/:id",
      auditAction("UPDATE_REFUND"),
      requirePermission("finance", "execute"),
      validateBody(refundTransactionSchema),
      (req) => {
        expectTypeOf(req.body).toEqualTypeOf<RefundTransaction>();
      },
    );
  });

  it("accepts strict and loose object schemas but not non-object schemas", () => {
    validateBody(z.strictObject({ a: z.string() }));
    validateBody(z.looseObject({ a: z.string() }));
    // @ts-expect-error a body schema must be a Zod object
    validateBody(z.string());
  });
});
