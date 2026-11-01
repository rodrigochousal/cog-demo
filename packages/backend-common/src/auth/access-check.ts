import type { AccessCheckResponse } from "@platform/shared-types";
import { Router } from "express";
import { RESOURCE_ACTIONS, type Action, type Resource, type ResourceAction } from "./permissions.js";
import { permissionDenied, requirePermission } from "./require-permission.js";
import "./request.js";

/**
 * Placeholder endpoints that exercise the RBAC guards for one resource, with no business logic.
 * Mounts one route per action in {@link RESOURCE_ACTIONS}: `GET /read`, and `POST /<action>` for
 * every other (mutating) verb. Each route answers {@link AccessCheckResponse} when allowed and
 * the standard 403 otherwise. Mount under `/api` of a `createServiceApp` app, which puts {@link injectMockUser} in front.
 *
 * @example
 * router.use("/access", createAccessCheckRouter("finance")); // GET /api/access/read, POST /api/access/execute
 */
export function createAccessCheckRouter(resource: Resource): Router {
  const router = Router();
  const actions: readonly Action[] = RESOURCE_ACTIONS[resource];
  for (const action of actions) {
    const method = action === "read" ? "get" : "post";
    router[method](`/${action}`, requirePermission(...([resource, action] as ResourceAction)), (req, res, next) => {
      if (!req.user) {
        next(permissionDenied());
        return;
      }
      const body: AccessCheckResponse = { resource, action, allowed: true, user: req.user };
      res.json(body);
    });
  }
  return router;
}
