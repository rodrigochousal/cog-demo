import type {
  CreateRefundInput,
  CustomerTier,
  FeatureFlag,
  KycManualDecisionInput,
  KycVerificationPayload,
  RefundRecord,
  UpdateRefundInput,
} from "@platform/shared-types";
import type { LatencySetting } from "./latency.js";

/**
 * Connector contracts. Services depend only on these; the hub decides which
 * driver backs them (local JSON files today, Postgres / vendor REST in production).
 *
 * Error contract for every implementation:
 * - unknown id/key           → DomainError `NOT_FOUND` (HTTP 404)
 * - blank id or invalid input → DomainError `BUSINESS_RULE_VIOLATION` (HTTP 422)
 * - state conflict            → DomainError `CONFLICT` (HTTP 409)
 * - storage/transport failure → ConnectorError (HTTP 500, logged)
 */

/** The finance ledger database (refunds). Production: a PostgreSQL cluster. */
export interface ILedgerDatabase {
  findById(id: string): Promise<RefundRecord>;
  findAll(): Promise<RefundRecord[]>;
  updateRecord(id: string, data: UpdateRefundInput): Promise<RefundRecord>;
  createRecord(data: CreateRefundInput): Promise<RefundRecord>;
}

/** A KYC vendor API (Persona, Alloy, …) backing the compliance review queue. */
export interface IKycVendorClient {
  /** Every verification the vendor holds, oldest submission first — the review queue's source. */
  listVerificationPayloads(): Promise<KycVerificationPayload[]>;
  getVerificationPayload(applicantId: string): Promise<KycVerificationPayload>;
  /** Records an analyst's decision and returns the updated payload. Finalised applicants reject decisions (CONFLICT). */
  submitManualDecision(applicantId: string, decision: KycManualDecisionInput): Promise<KycVerificationPayload>;
}

/** A feature-flag service (LaunchDarkly, Unleash, …) backing the engineering console. */
export interface IFeatureFlagProvider {
  getFlags(): Promise<FeatureFlag[]>;
  toggleFlag(key: string, enabledState: boolean): Promise<FeatureFlag>;
  updateTargeting(key: string, tiers: readonly CustomerTier[]): Promise<FeatureFlag>;
}

/** Implemented by drivers that need to prepare storage (create + seed) before serving traffic. */
export interface InitializableConnector {
  initialize(): Promise<void>;
}

/** Options shared by the Disk* adapters. */
export interface DiskConnectorOptions {
  filePath: string;
  latency: LatencySetting;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}
