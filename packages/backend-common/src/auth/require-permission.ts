import type { PermissionDeniedBody } from "@platform/shared-types";
import type { RequestHandler } from "express";
import { hasPermission, PERMISSIONS, type PermissionMatrix, type ResourceAction } from "./permissions.js";
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
 * `resource`/`action` are type-checked as a pair against the matrix, so typos and mismatched
 * pairs (e.g. `"finance", "toggle"`) fail at compile time.
 *
 * @example
 * router.post("/refunds/:id/execute", requirePermission("finance", "execute"), handler);
 */
export function requirePermission(...args: [...ResourceAction, matrix?: PermissionMatrix]): RequestHandler {
  const [resource, action, matrix = PERMISSIONS] = args;
  return (req, res, next) => {
    if (req.user && hasPermission(req.user.role, resource, action, matrix)) {
      next();
      return;
    }
    res.status(403).json(PERMISSION_DENIED_BODY);
  };
}
