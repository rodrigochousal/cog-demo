import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { suiteLinks, surface } from "@/lib/surface";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">Internal Platform</span>
            <span className="text-sm text-muted-foreground">/ {surface.team}</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            {suiteLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors hover:bg-muted",
                  link.current ? "bg-muted font-medium" : "text-muted-foreground",
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto font-mono text-xs text-muted-foreground">BFF: {surface.bffUrl}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
