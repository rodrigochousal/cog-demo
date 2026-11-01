/**
 * Identity and access-control contracts shared by every app and service.
 *
 * Roles map 1-to-1 to the platform's surfaces (`apps/<x>` + `services/<x>`), plus `admin`,
 * which may act on every surface.
 */

/** Every role the platform recognises. */
export const USER_ROLES = ["admin", "compliance_analyst", "finance_analyst", "engineer"] as const;

/** `'admin' | 'compliance_analyst' | 'finance_analyst' | 'engineer'` */
export type UserRole = (typeof USER_ROLES)[number];

/** The caller identity a BFF attaches to `req.user` once a request is authenticated. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
}

/** Body of the HTTP 403 a BFF returns when the caller's role lacks a permission. */
export interface PermissionDeniedBody {
  error: "Unauthorized";
  reason: string;
}

/** Narrows an arbitrary string (e.g. a header value) to a known {@link UserRole}. */
export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
