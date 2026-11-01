import { kycReviewRowSchema, type KycDecisionRequest } from "@platform/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runBatch } from "ui-shared";
import { apiClient } from "@/common/api-client";
import { kycQueueKeys } from "./query-keys";

export interface SubmitKycDecisionsInput {
  applicantIds: readonly string[];
  decision: KycDecisionRequest;
}

/** Submits one manual decision per applicant, then re-fetches the queue. */
export function useSubmitKycDecisions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicantIds, decision }: SubmitKycDecisionsInput) =>
      runBatch(applicantIds, (id) =>
        apiClient.postParsed(`/api/kyc/verifications/${encodeURIComponent(id)}/decisions`, decision, kycReviewRowSchema),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kycQueueKeys.all }),
  });
}
