import { kycReviewQueueResponseSchema } from "@platform/shared-types";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/common/api-client";
import { kycQueueKeys } from "./query-keys";

/** `GET /api/kyc/verifications`, parsed against the queue contract. */
export function useKycQueue() {
  return useQuery({
    queryKey: kycQueueKeys.list(),
    queryFn: ({ signal }) => apiClient.getParsed("/api/kyc/verifications", kycReviewQueueResponseSchema, { signal }),
    select: (response) => response.rows,
  });
}
