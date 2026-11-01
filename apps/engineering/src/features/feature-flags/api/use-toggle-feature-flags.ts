import { featureFlagRowSchema, type FeatureFlagToggleRequest } from "@platform/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runBatch } from "ui-shared";
import { apiClient } from "@/common/api-client";
import { featureFlagKeys } from "./query-keys";

export interface ToggleFeatureFlagsInput {
  flagIds: readonly string[];
  enabled: FeatureFlagToggleRequest["enabled"];
}

/** Turns each flag on or off, then re-fetches the panel. */
export function useToggleFeatureFlags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flagIds, enabled }: ToggleFeatureFlagsInput) =>
      runBatch(flagIds, (id) => {
        const body: FeatureFlagToggleRequest = { enabled };
        return apiClient.postParsed(`/api/feature-flags/${encodeURIComponent(id)}/toggle`, body, featureFlagRowSchema);
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: featureFlagKeys.all }),
  });
}
