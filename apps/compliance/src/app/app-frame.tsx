import { AppShell, BffHealthBadge } from "ui-shared";
import type { ReactNode } from "react";
import { apiClient } from "@/common/api-client";
import { suiteLinks, surface } from "@/common/surface";

/** Chrome shared by every route of this app. */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <AppShell team={surface.team} product={surface.product} suiteLinks={suiteLinks} currentSuite={surface.suite} status={<BffHealthBadge client={apiClient} />}>
      {children}
    </AppShell>
  );
}
