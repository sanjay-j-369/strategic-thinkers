import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/site-header";
import { AuthProvider } from "@/components/providers/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Founder OS",
  description:
    "A monochrome founder command center for live context, strategic guidance, and privacy controls.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AuthProvider>
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_28%)]" />
            <div className="absolute inset-x-0 top-0 h-[520px] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] opacity-40" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.06),transparent_26%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.05),transparent_24%),linear-gradient(180deg,#0a0a0a_0%,#050505_55%,#020202_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[0.08]" />
          </div>

          <div className="px-4 pb-10 pt-4 sm:px-6 lg:px-8">
            <SiteHeader />
            <main className="mx-auto max-w-7xl">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
