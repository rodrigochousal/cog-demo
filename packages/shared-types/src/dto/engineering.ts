import type { FeatureFlagRow } from "../contracts/engineering.js";

/** Screen-shaped DTOs exchanged between apps/engineering and services/engineering. */

/** `GET /api/feature-flags`: the flag console, by key. */
export interface FeatureFlagsResponse {
  rows: FeatureFlagRow[];
}
