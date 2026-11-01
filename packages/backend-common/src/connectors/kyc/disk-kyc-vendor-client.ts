import { KYC_DECISION_OUTCOMES, KYC_FINAL_STATUSES } from "../../domain/index.js";
import type { KycDecisionOutcome, KycManualDecisionInput, KycVerification, KycVerificationStatus } from "../../domain/index.js";
import { DomainError } from "../../errors.js";
import { indexOrThrow, invalidInput, requireId } from "../errors.js";
import type { DiskConnectorOptions, IKycVendorClient, InitializableConnector } from "../interfaces.js";
import { ownerOf, readAllFrom, VendorCollection, type DomainCollection, type VendorAdapter } from "../vendor-collection.js";
import { alloyEvaluations } from "./vendors/alloy.js";
import { personaInquiries } from "./vendors/persona.js";

const ENTITY = "KYC applicant";

const STATUS_AFTER: Record<KycDecisionOutcome, KycVerificationStatus> = {
  approve: "approved",
  reject: "rejected",
  escalate: "escalated",
};

const isFinal = (status: KycVerificationStatus) => (KYC_FINAL_STATUSES as readonly KycVerificationStatus[]).includes(status);

function assertValidDecision(decision: KycManualDecisionInput): KycManualDecisionInput {
  if (!(KYC_DECISION_OUTCOMES as readonly string[]).includes(decision.outcome)) {
    throw invalidInput(`Decision outcome must be one of ${KYC_DECISION_OUTCOMES.join(", ")}`);
  }
  if (typeof decision.reviewerId !== "string" || decision.reviewerId.trim() === "") throw invalidInput("Decision reviewerId is required");
  if (typeof decision.reason !== "string" || decision.reason.trim() === "") throw invalidInput("Decision reason is required");
  return { outcome: decision.outcome, reviewerId: decision.reviewerId.trim(), reason: decision.reason.trim() };
}

const bySubmission = (a: KycVerification, b: KycVerification) =>
  a.submittedAt.localeCompare(b.submittedAt) || a.applicantId.localeCompare(b.applicantId);

/**
 * IKycVendorClient over one mock API per vendor (`<data dir>/persona-inquiries.json`,
 * `alloy-evaluations.json`). Each vendor's adapter maps its own payload to the generic
 * `KycVerification`; nothing outside this connector sees a vendor's shape.
 */
export class DiskKycVendorClient implements IKycVendorClient, InitializableConnector {
  readonly #collections: DomainCollection<KycVerification>[];
  readonly #now: () => Date;

  constructor({ dataDir, mode, latency, now = () => new Date() }: DiskConnectorOptions) {
    this.#now = now;
    const open = <E>(adapter: VendorAdapter<E, KycVerification>) =>
      new VendorCollection(adapter, { dataDir, mode, latency }, { connector: "kyc", entity: ENTITY, idOf: (r) => r.applicantId });
    this.#collections = [open(personaInquiries), open(alloyEvaluations)];
  }

  async initialize(): Promise<void> {
    await Promise.all(this.#collections.map((collection) => collection.initialize()));
  }

  async listVerifications(): Promise<KycVerification[]> {
    return (await readAllFrom(this.#collections)).sort(bySubmission);
  }

  async getVerification(applicantId: string): Promise<KycVerification> {
    requireId(ENTITY, applicantId);
    const records = await readAllFrom(this.#collections);
    return records[indexOrThrow(records, ENTITY, applicantId, (r) => r.applicantId)] as KycVerification;
  }

  async submitManualDecision(applicantId: string, decision: KycManualDecisionInput): Promise<KycVerification> {
    requireId(ENTITY, applicantId);
    const input = assertValidDecision(decision);
    const owner = await ownerOf(this.#collections, ENTITY, applicantId, (r) => r.applicantId);
    return owner.update(applicantId, (current) => {
      if (isFinal(current.status)) {
        throw new DomainError("CONFLICT", `${ENTITY} '${applicantId}' is already ${current.status}; no further decisions are accepted`);
      }
      const decidedAt = this.#now().toISOString();
      return {
        ...current,
        decisions: [...current.decisions, { ...input, decidedAt }],
        status: STATUS_AFTER[input.outcome],
        updatedAt: decidedAt,
      };
    });
  }
}
