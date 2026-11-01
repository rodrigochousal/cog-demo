/**
 * RBAC for the BFF services.
 *
 * Mount order: identity first, then per-route guards.
 *
 * @example
 * import { createServiceApp, requirePermission } from "@platform/backend-common";
 *
 * createServiceApp({ ..., routes: (app) => app.use("/api", router) }); // mounts injectMockUser on /api
 * router.get("/refunds", requirePermission("finance", "read"), listRefunds);
 * router.post("/refunds/:id/execute", requirePermission("finance", "execute"), executeRefund);
 */
export * from "./permissions.js";
export * from "./mock-identity.js";
export * from "./require-permission.js";
export * from "./access-check.js";
// Side effect: adds `req.user` to Express's Request type for every consumer.
export * from "./request.js";
