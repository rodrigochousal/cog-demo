import type { FeatureFlagRow } from "@platform/shared-types";
import { describeError, Switch, toast } from "ui-shared";
import { useToggleFeatureFlags } from "../api/use-toggle-feature-flags";

/** Inline on/off control; shows the requested state while the toggle is in flight. */
export function FlagSwitch({ flag }: { flag: FeatureFlagRow }) {
  const toggle = useToggleFeatureFlags();
  const checked = toggle.isPending ? toggle.variables.enabled : flag.enabled;
  return (
    <div className="flex items-center gap-1.5">
      <Switch
        size="sm"
        aria-label={`Toggle ${flag.key}`}
        checked={checked}
        disabled={toggle.isPending}
        onCheckedChange={(enabled) =>
          toggle.mutate(
            { flagIds: [flag.id], enabled },
            {
              onSuccess: () => toast.success(`${flag.key} ${enabled ? "enabled" : "disabled"}`),
              onError: (error) => toast.error(`Could not toggle ${flag.key}`, { description: describeError(error) }),
            },
          )
        }
      />
      <span className={checked ? "text-success" : "text-muted-foreground"}>{checked ? "On" : "Off"}</span>
    </div>
  );
}
