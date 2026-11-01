import { describe, expectTypeOf, it } from "vitest";
import type { Request } from "express";
import type { AuthenticatedUser } from "@platform/shared-types";
import { requirePermission } from "../src/index.js";

describe("RBAC typing", () => {
  it("augments Express Request with user", () => {
    expectTypeOf<Request["user"]>().toEqualTypeOf<AuthenticatedUser | undefined>();
  });

  it("rejects actions that don't exist for a resource", () => {
    // @ts-expect-error 'toggle' is not a finance action
    requirePermission("finance", "toggle");
    // @ts-expect-error unknown resource
    requirePermission("payroll", "read");
  });
});
