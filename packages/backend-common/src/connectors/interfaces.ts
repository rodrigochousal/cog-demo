import type {
  CreateRefundInput,
  CustomerTier,
  FeatureFlag,
  KycManualDecisionInput,
  KycVerification,
  Refund,
  UpdateRefundInput,
} from "../domain/index.js";
import type { StorageMode } from "../config.js";
import type { LatencySetting } from "./latency.js";

/**
 * Connector contracts. Services depend only on these; the hub decides which
 * driver backs them (local JSON files today, Postgres / vendor REST in production).
 * They speak the generic domain types only: each vendor's own record shape stays inside
 * its adapter (`connectors/<x>/vendors/*`), so adding or swapping a vendor changes no service.
 *
 * Error contract for every implementation:
 * - unknown id/key           → DomainError `NOT_FOUND` (HTTP 404)
 * - blank id or invalid input → DomainError `BUSINESS_RULE_VIOLATION` (HTTP 422)
 * - state conflict            → DomainError `CONFLICT` (HTTP 409)
 * - storage/transport failure → ConnectorError (HTTP 500, logged)
 */

/** Refunds across every payment processor (Stripe, PayPal, …), oldest first. */
export interface ILedgerDatabase {
  findById(id: string): Promise<Refund>;
  findAll(): Promise<Refund[]>;
  updateRecord(id: string, data: UpdateRefundInput): Promise<Refund>;
  /** Stored with `data.processor`, the processor of the original charge. */
  createRecord(data: CreateRefundInput): Promise<Refund>;
}

/** KYC vendor APIs (Persona, Alloy, …) backing the compliance review queue. */
export interface IKycVendorClient {
  /** Every verification across vendors, oldest submission first — the review queue's source. */
  listVerifications(): Promise<KycVerification[]>;
  getVerification(applicantId: string): Promise<KycVerification>;
  /** Records an analyst's decision and returns the updated verification. Finalised applicants reject decisions (CONFLICT). */
  submitManualDecision(applicantId: string, decision: KycManualDecisionInput): Promise<KycVerification>;
}

/** Feature-flag services (LaunchDarkly, Unleash, …) backing the engineering console. */
export interface IFeatureFlagProvider {
  /** Every flag across providers, by key. */
  getFlags(): Promise<FeatureFlag[]>;
  /** `actor` (who made the change) becomes the flag's `updatedBy`. */
  toggleFlag(key: string, enabledState: boolean, actor: string): Promise<FeatureFlag>;
  updateTargeting(key: string, tiers: readonly CustomerTier[], actor: string): Promise<FeatureFlag>;
}

/** Implemented by drivers that need to prepare storage (create + seed) before serving traffic. */
export interface InitializableConnector {
  initialize(): Promise<void>;
}

/** Options shared by the Disk* drivers. */
export interface DiskConnectorOptions {
  /** Directory holding one JSON file per mocked vendor API. */
  dataDir: string;
  /** `file` (default) persists to `dataDir`; `memory` keeps state in the instance, never touching disk. */
  mode?: StorageMode;
  latency: LatencySetting;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}
