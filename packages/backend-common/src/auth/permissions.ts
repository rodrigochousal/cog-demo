import type { UserRole } from "@platform/shared-types";

/**
 * Declarative RBAC permission matrix.
 *
 * Each resource is one platform domain (and therefore one app + BFF pair) and lists the
 * action verbs that exist for it. Domain roles are granted actions on their own resource
 * only; `admin` bypasses the matrix entirely.
 */
export const RESOURCE_ACTIONS = {
  /** KYC reviews — `apps/compliance` + `services/compliance`. */
  compliance: ["read", "approve"],
  /** Refunds — `apps/finance` + `services/finance`. */
  finance: ["read", "execute"],
  /** Feature flags — `apps/engineering` + `services/engineering`. */
  engineering: ["read", "toggle"],
} as const satisfies Record<string, readonly string[]>;

/** `'compliance' | 'finance' | 'engineering'` */
export type Resource = keyof typeof RESOURCE_ACTIONS;

/** Action verbs that exist for resource `R`, e.g. `Action<"finance">` is `'read' | 'execute'`. */
export type Action<R extends Resource = Resource> = (typeof RESOURCE_ACTIONS)[R][number];

/** Every valid `[resource, action]` pair, e.g. `["finance", "execute"]`. */
export type ResourceAction = { [R in Resource]: [resource: R, action: Action<R>] }[Resource];

/** Grants for a single role: resource -> allowed actions. Omitted resources are forbidden. */
export type RoleGrants = { readonly [R in Resource]?: readonly Action<R>[] };

/** A role either gets an explicit grant list or the universal `"*"` bypass. */
export type PermissionMatrix = Readonly<Record<UserRole, RoleGrants | "*">>;

/** Wildcard meaning "every action on every resource". */
export const ALL_PERMISSIONS = "*";

/**
 * The platform's permission matrix. Strict 1-to-1 domain alignment: each analyst/engineer
 * role can only touch its own app's domain.
 */
export const PERMISSIONS = {
  admin: ALL_PERMISSIONS,
  compliance_analyst: { compliance: ["read", "approve"] },
  finance_analyst: { finance: ["read", "execute"] },
  engineer: { engineering: ["read", "toggle"] },
} as const satisfies PermissionMatrix;

/**
 * Returns whether `role` may perform `action` on `resource` according to `matrix`.
 *
 * Accepts plain strings so it can be used with runtime values; unknown resources or actions
 * are denied for every role except one holding the `"*"` bypass.
 */
export function hasPermission(
  role: UserRole,
  resource: string,
  action: string,
  matrix: PermissionMatrix = PERMISSIONS,
): boolean {
  const grants = matrix[role];
  if (grants === ALL_PERMISSIONS) return true;
  if (!Object.hasOwn(grants, resource)) return false;
  const allowed: readonly string[] | undefined = grants[resource as Resource];
  return allowed?.includes(action) ?? false;
}
