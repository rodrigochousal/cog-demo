import type { SuiteLink } from "ui-shared";

/** Identity of this UI surface. Its only backend is `apiClient` (see api-client.ts). */
export const surface = {
  suite: "Finance",
  team: "Operations & Support",
  product: "Refunds Dashboard",
} as const;

/** Sibling surfaces in the internal suite (navigation only — never data). */
export const suiteLinks: readonly SuiteLink[] = [
  { label: "Compliance", href: "http://localhost:3000" },
  { label: "Finance", href: "http://localhost:3001" },
  { label: "Engineering", href: "http://localhost:3002" },
];
