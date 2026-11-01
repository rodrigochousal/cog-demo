"use client";

import { isUserRole, USER_ROLES } from "@platform/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ROLE_LABELS, setMockRole, useMockRole } from "../identity/mock-role";

/** Picks the mock role requests are made as; switching drops every cached query so screens re-fetch under the new identity. */
export function RoleSwitcher() {
  const role = useMockRole();
  const queryClient = useQueryClient();
  return (
    <Select
      value={role}
      onValueChange={(value) => {
        if (!isUserRole(value)) return;
        setMockRole(value);
        void queryClient.resetQueries();
      }}
    >
      <SelectTrigger size="sm" aria-label="Mock user role" className="h-7 w-44 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {USER_ROLES.map((r) => (
          <SelectItem key={r} value={r} className="text-xs">
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
