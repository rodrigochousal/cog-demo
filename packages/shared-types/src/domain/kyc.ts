import type { ISODateString } from "../common.js";

export type KycProviderStatus = "clear" | "consider" | "pending";

/**
 * A record held by the local mock of a third-party KYC provider.
 * Starter shape — extend it as surfaces that need KYC data are built.
 */
export interface KycProviderRecord {
  id: string;
  subjectId: string;
  provider: string;
  status: KycProviderStatus;
  checkedAt: ISODateString;
}
