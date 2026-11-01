import type { AuthenticatedUser } from "@platform/shared-types";

declare global {
  // Express exposes its Request interface through this global namespace for augmentation.
  namespace Express {
    interface Request {
      /**
       * Caller identity, set by {@link injectMockUser} (or a future real auth middleware).
       * Undefined until an identity middleware has run.
       */
      user?: AuthenticatedUser;
    }
  }
}

export {};
