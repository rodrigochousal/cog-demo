import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { ThemeToggle } from "../theme/theme";
import { RoleSwitcher } from "./role-switcher";

export interface SuiteLink {
  label: string;
  href: string;
}

export interface AppShellProps {
  team: string;
  product: string;
  /** Sibling surfaces (navigation only — never data). */
  suiteLinks: readonly SuiteLink[];
  currentSuite: string;
  /** Right-hand status slot, e.g. `<BffHealthBadge />`. */
  status?: ReactNode;
  children: ReactNode;
}

export function AppShell({ team, product, suiteLinks, currentSuite, status, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-11 w-full max-w-[1600px] items-center gap-4 px-4">
          <div className="flex items-baseline gap-1.5 text-sm">
            <span className="font-semibold tracking-tight">Internal Platform</span>
            <span className="text-muted-foreground">/ {team}</span>
          </div>
          <nav className="flex items-center gap-0.5 text-xs">
            {suiteLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                aria-current={link.label === currentSuite ? "page" : undefined}
                className={cn(
                  "rounded px-2 py-1 transition-colors hover:bg-muted",
                  link.label === currentSuite ? "bg-muted font-medium" : "text-muted-foreground",
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {status}
            <RoleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4" aria-label={product}>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "success" | "warning" | "destructive" }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">{children}</div>;
}
