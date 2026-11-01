import { refundTransactionRowSchema, type RefundDecisionRequest } from "@platform/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runBatch } from "ui-shared";
import { apiClient } from "@/common/api-client";
import { refundKeys } from "./query-keys";

export interface SubmitRefundDecisionsInput {
  refundIds: readonly string[];
  decision: RefundDecisionRequest;
}

/** Approves or rejects each refund, then re-fetches the dashboard. */
export function useSubmitRefundDecisions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ refundIds, decision }: SubmitRefundDecisionsInput) =>
      runBatch(refundIds, (id) =>
        apiClient.postParsed(`/api/refunds/${encodeURIComponent(id)}/decisions`, decision, refundTransactionRowSchema),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refundKeys.all }),
  });
}
