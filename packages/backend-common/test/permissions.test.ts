import { USER_ROLES, type UserRole } from "@platform/shared-types";
import { describe, expect, it } from "vitest";
import {
  hasPermission,
  PERMISSIONS,
  RESOURCE_ACTIONS,
  type PermissionMatrix,
  type Resource,
  type ResourceAction,
} from "../src/index.js";

const allPairs: ResourceAction[] = (Object.keys(RESOURCE_ACTIONS) as Resource[]).flatMap((resource) =>
  RESOURCE_ACTIONS[resource].map((action) => [resource, action] as ResourceAction),
);

/** The intended grants, written out independently of PERMISSIONS so a drift in the matrix fails here. */
const EXPECTED_GRANTS: Record<Exclude<UserRole, "admin">, readonly ResourceAction[]> = {
  compliance_analyst: [
    ["compliance", "read"],
    ["compliance", "approve"],
  ],
  finance_analyst: [
    ["finance", "read"],
    ["finance", "execute"],
  ],
  engineer: [
    ["engineering", "read"],
    ["engineering", "toggle"],
  ],
};

const isExpected = (role: Exclude<UserRole, "admin">, [resource, action]: ResourceAction) =>
  EXPECTED_GRANTS[role].some(([r, a]) => r === resource && a === action);

describe("RBAC permission matrix", () => {
  it("covers every role exactly once", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...USER_ROLES].sort());
  });

  describe.each(Object.keys(EXPECTED_GRANTS) as Exclude<UserRole, "admin">[])("%s", (role) => {
    const granted = allPairs.filter((pair) => isExpected(role, pair));
    const denied = allPairs.filter((pair) => !isExpected(role, pair));

    it.each(granted)("may %s → %s", (resource, action) => {
      expect(hasPermission(role, resource, action)).toBe(true);
    });

    it.each(denied)("is denied %s → %s", (resource, action) => {
      const allowed = hasPermission(role, resource, action);
      expect(allowed).toBe(false);
      expect(allowed).toBeFalsy();
    });
  });

  it.each(allPairs)("admin may %s → %s", (resource, action) => {
    expect(hasPermission("admin", resource, action)).toBe(true);
  });

  it.each([
    ["compliance_analyst", "compliance", "delete"],
    ["finance_analyst", "finance", "approve"],
    ["engineer", "engineering", "execute"],
    ["compliance_analyst", "payroll", "read"],
    ["finance_analyst", "constructor", "read"],
    ["engineer", "__proto__", "read"],
    ["engineer", "engineering", ""],
  ] satisfies [UserRole, string, string][])("denies %s an unknown pair %s → %s", (role, resource, action) => {
    expect(hasPermission(role, resource, action)).toBe(false);
  });

  it("evaluates a custom matrix instead of the default when one is passed", () => {
    const readOnly: PermissionMatrix = {
      admin: { compliance: ["read"] },
      compliance_analyst: {},
      finance_analyst: { finance: ["read"] },
      engineer: {},
    };
    expect(hasPermission("admin", "compliance", "read", readOnly)).toBe(true);
    expect(hasPermission("admin", "compliance", "approve", readOnly)).toBe(false);
    expect(hasPermission("compliance_analyst", "compliance", "read", readOnly)).toBe(false);
    expect(hasPermission("finance_analyst", "finance", "execute", readOnly)).toBe(false);
  });
});
