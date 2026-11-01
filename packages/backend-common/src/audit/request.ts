import type { AuditTrail } from "./trail.js";

declare global {
  // Express exposes its Request interface through this global namespace for augmentation.
  namespace Express {
    interface Request {
      /** Set by `auditLogger` on POST/PUT/PATCH/DELETE requests; undefined otherwise. */
      audit?: AuditTrail;
    }
  }
}

export {};
