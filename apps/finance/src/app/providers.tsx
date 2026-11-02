import { QueryProvider, setDefaultMockRole, Toaster } from "ui-shared";
import type { ReactNode } from "react";

setDefaultMockRole("finance_analyst");

/** Global wrappers: TanStack Query root (server state) and toasts. Theme is applied by `pages/_document.tsx`. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </QueryProvider>
  );
}
