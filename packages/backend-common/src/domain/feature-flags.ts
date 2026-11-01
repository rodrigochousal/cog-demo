import type { ISODateString } from "@platform/shared-types";

export const CUSTOMER_TIERS = ["free", "starter", "growth", "enterprise", "internal"] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

export const FLAG_ENVIRONMENTS = ["development", "staging", "production"] as const;
/** Flag keys are lower-case words joined by `-` or `.`, e.g. `instant-payouts`. */
export const FLAG_KEY_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

export type FlagEnvironment = (typeof FLAG_ENVIRONMENTS)[number];

/** Feature-flag services the platform reads flags from (e.g. mid-migration from Unleash to LaunchDarkly). */
export const FEATURE_FLAG_PROVIDERS = ["launchdarkly", "unleash"] as const;
export type FeatureFlagProvider = (typeof FEATURE_FLAG_PROVIDERS)[number];

/** The platform's provider-agnostic feature flag. */
export interface FeatureFlag {
  /** Stable identifier used in code, e.g. `instant-payouts`; unique across providers. */
  key: string;
  provider: FeatureFlagProvider;
  name: string;
  description: string;
  enabled: boolean;
  /** Customer tiers the flag is served to while enabled. Empty = nobody. */
  targetTiers: CustomerTier[];
  /** Percentage (0–100) of targeted customers that receive the flag. */
  rolloutPercentage: number;
  environment: FlagEnvironment;
  ownerTeam: string;
  tags: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** Handle of whoever last changed the flag. */
  updatedBy: string;
}
