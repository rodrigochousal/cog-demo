"use client";

import { isUserRole, USER_ROLES } from "@platform/shared-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, setMockRole, useMockRole } from "@/lib/mock-role";

/** Top-bar dropdown that picks which mock user role requests to the BFF are made as. */
export function RoleSwitcher() {
  const role = useMockRole();
  return (
    <Select
      value={role}
      onValueChange={(value) => {
        if (isUserRole(value)) setMockRole(value);
      }}
    >
      <SelectTrigger size="sm" aria-label="Mock user role" className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {USER_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
