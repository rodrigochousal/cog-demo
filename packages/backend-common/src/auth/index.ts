/**
 * RBAC for the BFF services.
 *
 * Mount order: identity first, then per-route guards.
 *
 * @example
 * import { injectMockUser, requirePermission } from "@platform/backend-common";
 *
 * app.use("/api", injectMockUser, router);
 * router.get("/refunds", requirePermission("finance", "read"), listRefunds);
 * router.post("/refunds/:id/execute", requirePermission("finance", "execute"), executeRefund);
 */
export * from "./permissions.js";
export * from "./mock-identity.js";
export * from "./require-permission.js";
export * from "./request.js";
