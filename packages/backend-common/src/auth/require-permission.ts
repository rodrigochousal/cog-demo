import type { PermissionDeniedBody } from "@platform/shared-types";
import type { RequestHandler } from "express";
import { hasPermission, PERMISSIONS, type Action, type PermissionMatrix, type Resource } from "./permissions.js";
import "./request.js";

/** Exact body returned with every RBAC 403. */
export const PERMISSION_DENIED_BODY: Readonly<PermissionDeniedBody> = Object.freeze({
  error: "Unauthorized",
  reason: "User role does not possess required permissions for this action.",
});

/**
 * Route guard factory. Allows the request through only if the role on `req.user` may perform
 * `action` on `resource`; otherwise ends the request immediately with HTTP 403 and
 * {@link PERMISSION_DENIED_BODY}. Requests with no `req.user` (identity middleware not mounted)
 * are also denied, so the guard fails closed.
 *
 * `resource`/`action` are type-checked against the matrix, so typos fail at compile time.
 *
 * @example
 * router.post("/refunds/:id/execute", requirePermission("finance", "execute"), handler);
 */
export function requirePermission<R extends Resource>(
  resource: R,
  action: Action<R>,
  matrix: PermissionMatrix = PERMISSIONS,
): RequestHandler {
  return (req, res, next) => {
    if (req.user && hasPermission(req.user.role, resource, action, matrix)) {
      next();
      return;
    }
    res.status(403).json(PERMISSION_DENIED_BODY);
  };
}
