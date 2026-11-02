import { featureFlagsResponseSchema } from "@platform/shared-types";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/common/api-client";
import { featureFlagKeys } from "./query-keys";

/** `GET /api/feature-flags`, parsed against the feature-flag contract. */
export function useFeatureFlags() {
  return useQuery({
    queryKey: featureFlagKeys.list(),
    queryFn: ({ signal }) => apiClient.getParsed("/api/feature-flags", featureFlagsResponseSchema, { signal }),
    select: (response) => response.rows,
  });
}
