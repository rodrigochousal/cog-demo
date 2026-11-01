import type { ISODateString } from "../common.js";

export const CUSTOMER_TIERS = ["free", "starter", "growth", "enterprise", "internal"] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

export type FlagEnvironment = "development" | "staging" | "production";

export interface FeatureFlag {
  /** Stable identifier used in code, e.g. `instant-payouts`. */
  key: string;
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
}
