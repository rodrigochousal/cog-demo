/**
 * ui-shared: cross-cutting frontend infrastructure for every apps/* surface. Apps import shared
 * patterns from here and keep only domain code locally.
 */

export { cn } from "./lib/utils";
export { formatCount, formatDateTime, formatMoney } from "./lib/format";
export { toast } from "sonner";

export { createApiClient, type ApiClient, type ApiClientConfig, type MutationMethod } from "./api/api-client";
export { ApiRequestError, SchemaMismatchError, describeError, isApiClientError, type ApiClientError } from "./api/errors";

export { QueryProvider, createAppQueryClient } from "./query/query-provider";
export { runBatch, type BatchResult } from "./query/settled";

export { ThemeToggle, setTheme, themeInitScript, useTheme, type Theme } from "./theme/theme";
export { ROLE_HEADER, ROLE_LABELS, getMockRole, mockIdentityHeaders, setDefaultMockRole, setMockRole, useMockRole } from "./identity/mock-role";

export { AppShell, PageHeader, StatCard, StatGrid, type AppShellProps, type SuiteLink } from "./shell/app-shell";
export { BffHealthBadge } from "./shell/bff-health-badge";
export { RoleSwitcher } from "./shell/role-switcher";
export { QueryErrorPanel, TableSkeleton } from "./shell/states";
export { ReasonDialog, type ReasonDialogProps } from "./shell/reason-dialog";

export {
  CoreDataTable,
  coreTableFeatures,
  createCoreColumnHelper,
  selectionColumn,
  type CoreColumnDef,
  type CoreColumnMeta,
  type CoreDataTableProps,
  type CoreRow,
  type CoreTable,
  type CoreTableFeatures,
  type FilterOption,
  type SelectionContext,
} from "./data-table/core-data-table";

export * from "./components/ui/badge";
export * from "./components/ui/button";
export * from "./components/ui/card";
export * from "./components/ui/checkbox";
export * from "./components/ui/dialog";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/input";
export * from "./components/ui/label";
export * from "./components/ui/select";
export * from "./components/ui/separator";
export * from "./components/ui/skeleton";
export * from "./components/ui/sonner";
export * from "./components/ui/switch";
export * from "./components/ui/table";
export * from "./components/ui/textarea";
