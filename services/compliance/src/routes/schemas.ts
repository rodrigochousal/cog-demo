import { KYC_DECISION_OUTCOMES, type KycManualDecisionInput } from "@platform/backend-common";
import { z } from "zod";

/** Path params for routes addressing one applicant's verification. */
export const applicantParamsSchema = z.object({
  applicantId: z.string().trim().min(1, "applicantId is required"),
});

/**
 * Body of `POST /api/kyc/verifications/:applicantId/decisions`. `reviewerId` is not accepted
 * from the client: it is taken from the authenticated caller.
 */
export const manualDecisionBodySchema = z
  .object({
    outcome: z.enum(KYC_DECISION_OUTCOMES),
    reason: z.string().trim().min(1, "reason is required").max(2000),
  })
  .strict() satisfies z.ZodType<Omit<KycManualDecisionInput, "reviewerId">>;

export type ManualDecisionBody = z.infer<typeof manualDecisionBodySchema>;
