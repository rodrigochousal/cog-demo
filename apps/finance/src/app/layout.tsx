import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { surface } from "@/lib/surface";
import "./globals.css";

export const metadata: Metadata = {
  title: `${surface.product} · ${surface.team}`,
  description: `${surface.team} internal tools`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-muted/30">
        <AppShell>{children}</AppShell>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
