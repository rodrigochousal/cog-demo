import type { FeatureFlag } from "@platform/backend-common";
import { featureFlagRowSchema, type FeatureFlagRow } from "@platform/shared-types";

/**
 * Backend `FeatureFlag` → client row, validated against the row contract before it leaves the BFF.
 * The backend key (e.g. `instant-payouts`) is the row's stable id; the row key is its snake_case form.
 */
export function toFeatureFlagRow(flag: FeatureFlag): FeatureFlagRow {
  return featureFlagRowSchema.parse({
    id: flag.key,
    key: flag.key.replace(/[-.]/g, "_"),
    description: flag.description,
    enabled: flag.enabled,
    targetedTiers: flag.targetTiers,
    updatedBy: flag.updatedBy,
    updatedAt: flag.updatedAt,
  });
}
