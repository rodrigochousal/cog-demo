import type { RequestHandler } from "express";
import { HttpError } from "../http/errors.js";
import { hasPermission, PERMISSIONS, type PermissionMatrix, type ResourceAction } from "./permissions.js";
import "./request.js";

/** Message carried by every RBAC 403. */
export const PERMISSION_DENIED_MESSAGE = "User role does not possess required permissions for this action.";

/** The error every RBAC denial passes to the shared error handler. */
export const permissionDenied = (): HttpError => new HttpError(403, "FORBIDDEN", PERMISSION_DENIED_MESSAGE);

/**
 * Route guard factory. Allows the request through only if the role on `req.user` may perform
 * `action` on `resource`; otherwise short-circuits to the shared error handler, which responds
 * `403 { error: { code: "FORBIDDEN", message: PERMISSION_DENIED_MESSAGE } }`. Requests with no
 * `req.user` (identity middleware not mounted) are also denied, so the guard fails closed.
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
    next(permissionDenied());
  };
}
