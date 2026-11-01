import { refundTransactionsResponseSchema } from "@platform/shared-types";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/common/api-client";
import { refundKeys } from "./query-keys";

/** `GET /api/refunds`, parsed against the refunds contract. */
export function useRefunds() {
  return useQuery({
    queryKey: refundKeys.list(),
    queryFn: ({ signal }) => apiClient.getParsed("/api/refunds", refundTransactionsResponseSchema, { signal }),
    select: (response) => response.rows,
  });
}
